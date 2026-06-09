package ai.codesetu.agent

import ai.codesetu.model.ChatMessage
import ai.codesetu.model.Tool
import ai.codesetu.model.ToolCall
import ai.codesetu.model.ToolFunction
import ai.codesetu.provider.CodeSetuProviderClient
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/** A short addendum to the system prompt that turns chat into an agent. */
const val AGENT_MODE_SYSTEM_NOTE =
  "Agent mode is on. You can read and modify the workspace and run shell commands " +
    "using the provided tools (read_file, write_file, edit_file, bash). Prefer making " +
    "the change directly and verifying it (e.g. run tests) over only describing it. " +
    "File edits and commands require the user's approval before they run."

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
  onEvent: (AgentEvent) -> Unit,
  isCancelled: () -> Boolean = { false },
  json: Json = Json { ignoreUnknownKeys = true },
): AgentLoopResult {
  val messages = initialMessages.toMutableList()
  val toolsByName = tools.associateBy { it.name }
  val toolSchemas = tools.map { Tool(function = ToolFunction(it.name, it.description, it.parameters)) }
  val alwaysApproved = mutableSetOf<String>()
  var finalText = ""

  repeat(maxIterations) {
    if (isCancelled()) {
      return AgentLoopResult(finalText, "aborted", messages.toList())
    }
    val message = client.chatWithTools(messages, toolSchemas, maxTokens, temperature)
    val assistantText = message.content ?: message.refusal ?: ""
    val toolCalls = message.toolCalls.orEmpty().filter { it.type == "function" }

    messages.add(
      ChatMessage(
        role = "assistant",
        content = assistantText,
        toolCalls = toolCalls.ifEmpty { null },
      ),
    )
    if (assistantText.isNotEmpty()) {
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
