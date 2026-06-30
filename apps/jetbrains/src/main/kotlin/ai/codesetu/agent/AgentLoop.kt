package ai.codesetu.agent

import ai.codesetu.model.ChatMessage
import ai.codesetu.model.Tool
import ai.codesetu.model.ToolCall
import ai.codesetu.model.ToolCallFunction
import ai.codesetu.model.ToolFunction
import ai.codesetu.provider.CodeSetuProviderClient
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/** A short addendum to the system prompt that turns chat into an agent. */
const val AGENT_MODE_SYSTEM_NOTE =
  "Agent mode is on. You can read and modify the workspace and run shell commands using the " +
    "provided tools (read_file, write_file, edit_file, bash, and the read-only search tools). " +
    "When the user asks you to create, change, scaffold, or run something, DO IT by calling the " +
    "tools. Do NOT give setup tutorials, do NOT tell the user to use an external website, IDE, or " +
    "generator (e.g. Spring Initializr), do NOT print files or commands for the user to copy, and " +
    "never claim you did something you did not actually do via a tool. To create a project or " +
    "folder, call write_file once per file (it creates any missing parent directories). Create the " +
    "files a project needs BEFORE building or running it — do not run build/run commands (mvn, " +
    "npm, gradle, etc.) until those files exist. Take one action at a time and use the real tool " +
    "results to decide the next step. File edits and shell commands require the user's approval " +
    "before they run."

const val DEFAULT_MAX_ITERATIONS = 16

enum class ApprovalDecision { APPROVE, APPROVE_ALWAYS, DENY }

data class ApprovalRequest(
  val tool: AgentTool,
  val args: JsonObject,
  val rawArguments: String,
  /** Human-readable preview of the pending change (e.g. a diff), if available. */
  val preview: String? = null,
)

/** Observability into a loop run, for surfacing activity in the chat UI. */
sealed class AgentEvent {
  data class AssistantText(val text: String) : AgentEvent()
  data class ToolCallStarted(val name: String, val args: JsonObject) : AgentEvent()
  data class ToolResultReady(
    val name: String,
    val content: String,
    val isError: Boolean,
    val denied: Boolean,
  ) : AgentEvent()

  data class IterationLimit(val limit: Int) : AgentEvent()
}

data class AgentLoopResult(
  val text: String,
  val stoppedReason: String,
  /** Full transcript including assistant tool-call turns and tool results. */
  val messages: List<ChatMessage>,
)

/**
 * Make a transcript safe to send after history trimming may have split a
 * tool-call/result pair: drop dangling assistant `tool_calls` (no matching
 * result) and orphan `tool` messages (no surviving call). Mirrors
 * sanitizeToolMessages in @codesetu/core.
 */
fun sanitizeToolMessages(messages: List<ChatMessage>): List<ChatMessage> {
  val respondedIds = messages.mapNotNull { if (it.role == "tool") it.toolCallId else null }.toSet()
  val keptCallIds = HashSet<String>()
  val result = ArrayList<ChatMessage>()
  for (message in messages) {
    val toolCalls = message.toolCalls
    when {
      message.role == "assistant" && !toolCalls.isNullOrEmpty() -> {
        val kept = toolCalls.filter { respondedIds.contains(it.id) }
        when {
          kept.size == toolCalls.size -> {
            result.add(message)
            kept.forEach { keptCallIds.add(it.id) }
          }
          kept.isNotEmpty() -> {
            result.add(message.copy(toolCalls = kept))
            kept.forEach { keptCallIds.add(it.id) }
          }
          message.content.isNotEmpty() -> result.add(message.copy(toolCalls = null))
        }
      }
      message.role == "tool" -> {
        if (message.toolCallId != null && keptCallIds.contains(message.toolCallId)) {
          result.add(message)
        }
      }
      else -> result.add(message)
    }
  }
  return result
}

/**
 * Recover tool calls a model emitted as text in the message content instead of
 * the structured tool_calls field — common with local models via Ollama /
 * llama.cpp. Handles <tool_call>{…}</tool_call> blocks, fenced JSON, and a bare
 * JSON object. Only objects whose name matches a known tool and that carry an
 * arguments/parameters field are accepted. Mirrors parseToolCallsFromContent in
 * @codesetu/core.
 */
fun parseToolCallsFromContent(
  content: String,
  knownToolNames: Set<String>,
  json: Json,
): List<ToolCall> {
  val results = ArrayList<ToolCall>()

  fun tryAdd(jsonText: String) {
    val obj =
      try {
        json.parseToJsonElement(jsonText).jsonObject
      } catch (error: Exception) {
        return
      }
    val name = (obj["name"] as? JsonPrimitive)?.contentOrNull ?: return
    if (!knownToolNames.contains(name)) return
    if (!obj.containsKey("arguments") && !obj.containsKey("parameters")) return
    val argsElement = obj["arguments"] ?: obj["parameters"]
    val argsText =
      when (argsElement) {
        is JsonPrimitive -> argsElement.contentOrNull ?: "{}"
        null -> "{}"
        else -> argsElement.toString()
      }
    results.add(
      ToolCall(id = "fallback_${results.size}", type = "function", function = ToolCallFunction(name, argsText)),
    )
  }

  val tagMatches = Regex("<tool_call>\\s*([\\s\\S]*?)</tool_call>").findAll(content).toList()
  if (tagMatches.isNotEmpty()) {
    tagMatches.forEach { tryAdd(it.groupValues[1].trim()) }
    return results
  }

  Regex("```(?:json)?\\s*([\\s\\S]*?)```").findAll(content).forEach { tryAdd(it.groupValues[1].trim()) }
  if (results.isNotEmpty()) return results

  val trimmed = content.trim()
  if (trimmed.startsWith("{")) tryAdd(trimmed)
  return results
}

/**
 * Drive the provider through a tool-calling loop: ask the model, run any tool
 * calls (gating mutating ones behind [requestApproval]), feed results back, and
 * repeat until the model answers without a tool call or the iteration cap trips.
 * Mirrors runAgentLoop in @codesetu/core. Runs synchronously on the caller's
 * (background) thread; [requestApproval] is responsible for hopping to the EDT.
 */
fun runAgentLoop(
  client: CodeSetuProviderClient,
  initialMessages: List<ChatMessage>,
  tools: List<AgentTool>,
  host: AgentHost,
  maxTokens: Int,
  temperature: Double,
  maxIterations: Int = DEFAULT_MAX_ITERATIONS,
  requestApproval: (ApprovalRequest) -> ApprovalDecision,
  resolvePolicy: (AgentTool, JsonObject) -> String = { _, _ -> "prompt" },
  onEvent: (AgentEvent) -> Unit,
  isCancelled: () -> Boolean = { false },
  json: Json = Json { ignoreUnknownKeys = true },
  promptTools: Boolean = true,
): AgentLoopResult {
  val messages = initialMessages.toMutableList()
  val toolsByName = tools.associateBy { it.name }
  val toolSchemas = tools.map { Tool(function = ToolFunction(it.name, it.description, it.parameters)) }

  // Teach non-native-tool models how to call tools as text (recovered by
  // parseToolCallsFromContent). Folded into the system message so it rides with
  // the prompt; native-tool models ignore it and use the structured path.
  if (promptTools && tools.isNotEmpty()) {
    val toolsPrompt = buildAgentToolsPrompt(tools)
    val systemIndex = messages.indexOfFirst { it.role == "system" }
    if (systemIndex >= 0) {
      val existing = messages[systemIndex]
      messages[systemIndex] = existing.copy(content = existing.content + "\n\n" + toolsPrompt)
    } else {
      messages.add(0, ChatMessage("system", toolsPrompt))
    }
  }
  val alwaysApproved = mutableSetOf<String>()
  var finalText = ""

  repeat(maxIterations) {
    if (isCancelled()) {
      return AgentLoopResult(finalText, "aborted", messages.toList())
    }
    val message = client.chatWithTools(messages, toolSchemas, maxTokens, temperature)
    val assistantText = message.content ?: message.refusal ?: ""
    var toolCalls = message.toolCalls.orEmpty().filter { it.type == "function" }

    // Fallback: many local models (via Ollama / llama.cpp) emit a tool call as
    // JSON in the message content instead of the structured tool_calls field.
    var usedContentFallback = false
    if (toolCalls.isEmpty() && assistantText.isNotBlank()) {
      val recovered = parseToolCallsFromContent(assistantText, toolsByName.keys, json)
      if (recovered.isNotEmpty()) {
        toolCalls = recovered
        usedContentFallback = true
      }
    }

    messages.add(
      ChatMessage(
        role = "assistant",
        content = if (usedContentFallback) "" else assistantText,
        toolCalls = toolCalls.ifEmpty { null },
      ),
    )
    if (!usedContentFallback && assistantText.isNotEmpty()) {
      finalText = assistantText
      onEvent(AgentEvent.AssistantText(assistantText))
    }
    if (toolCalls.isEmpty()) {
      return AgentLoopResult(finalText, "completed", messages.toList())
    }

    for (call in toolCalls) {
      if (isCancelled()) {
        return AgentLoopResult(finalText, "aborted", messages.toList())
      }
      val tool = toolsByName[call.function.name]
      if (tool == null) {
        addToolResult(messages, onEvent, call.id, call.function.name, "Unknown tool: ${call.function.name}", isError = true, denied = false)
        continue
      }

      val args = parseArguments(call.function.arguments, json)
      onEvent(AgentEvent.ToolCallStarted(tool.name, args))

      if (tool.risk == ToolRisk.MUTATING && !alwaysApproved.contains(tool.name)) {
        val policyDecision = resolvePolicy(tool, args)
        if (policyDecision == "deny") {
          addToolResult(
            messages,
            onEvent,
            call.id,
            tool.name,
            "Blocked by workspace policy (.codesetu/agent.json denyCommands).",
            isError = true,
            denied = true,
          )
          continue
        }
        if (policyDecision == "prompt") {
          val preview =
            try {
              tool.preview(args, host)
            } catch (error: Exception) {
              null // a preview failure must never block the action
            }
          when (requestApproval(ApprovalRequest(tool, args, call.function.arguments, preview))) {
            ApprovalDecision.DENY -> {
              addToolResult(messages, onEvent, call.id, tool.name, "User denied this action.", isError = true, denied = true)
              continue
            }
            ApprovalDecision.APPROVE_ALWAYS -> alwaysApproved.add(tool.name)
            ApprovalDecision.APPROVE -> Unit
          }
        }
        // "allow" falls through to execute without prompting.
      }

      val result =
        try {
          tool.execute(args, host)
        } catch (error: Exception) {
          ToolResult("Tool error: ${error.message ?: error}", isError = true)
        }
      addToolResult(messages, onEvent, call.id, tool.name, result.content, result.isError, denied = false)
    }
  }

  onEvent(AgentEvent.IterationLimit(maxIterations))
  return AgentLoopResult(finalText, "iteration_limit", messages.toList())
}

private fun addToolResult(
  messages: MutableList<ChatMessage>,
  onEvent: (AgentEvent) -> Unit,
  id: String,
  name: String,
  content: String,
  isError: Boolean,
  denied: Boolean,
) {
  messages.add(ChatMessage(role = "tool", content = content, toolCallId = id))
  onEvent(AgentEvent.ToolResultReady(name, content, isError, denied))
}

private fun parseArguments(raw: String, json: Json): JsonObject {
  if (raw.isBlank()) return JsonObject(emptyMap())
  return try {
    json.parseToJsonElement(raw).jsonObject
  } catch (error: Exception) {
    JsonObject(emptyMap())
  }
}
