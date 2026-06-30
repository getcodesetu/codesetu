package ai.codesetu.agent

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/** Whether a tool only observes the workspace (auto-approved) or changes it. */
enum class ToolRisk { SAFE, MUTATING }

data class ToolResult(val content: String, val isError: Boolean = false)

/** One callable tool: an OpenAI-style schema plus its executor. */
interface AgentTool {
  val name: String
  val description: String
  val parameters: JsonObject
  val risk: ToolRisk
  fun execute(args: JsonObject, host: AgentHost): ToolResult

  /**
   * Optional human-readable preview of the change this call would make (e.g. a
   * diff), shown in the approval prompt. Returns null if there's nothing useful.
   */
  fun preview(args: JsonObject, host: AgentHost): String? = null
}

const val MAX_TOOL_OUTPUT_CHARS = 30_000
const val DEFAULT_BASH_TIMEOUT_MS = 120_000L
const val MAX_GLOB_RESULTS = 200
const val MAX_GREP_FILES = 1_000
const val MAX_GREP_MATCHES = 200

/**
 * The agent's tools, in the order presented to the model: the four primitives
 * plus the read-only helpers (auto-approved) that lift quality on smaller models.
 */
fun defaultAgentTools(): List<AgentTool> =
  listOf(
    ReadFileTool,
    ListDirTool,
    GlobTool,
    GrepTool,
    WriteFileTool,
    EditFileTool,
    BashTool,
    TodoWriteTool,
  )

/**
 * A system-prompt section that teaches a model to call tools as text, for models
 * without native function-calling (e.g. Gemma, many small local models via
 * Ollama). The loop recovers these `<tool_call>{…}</tool_call>` blocks via
 * parseToolCallsFromContent; native-tool models ignore it. Mirrors the
 * TypeScript buildAgentToolsPrompt in @codesetu/core.
 */
fun buildAgentToolsPrompt(tools: List<AgentTool>): String {
  val lines = tools.map { tool ->
    val params = describeToolParams(tool.parameters)
    "- ${tool.name}: ${tool.description}" + if (params.isNotEmpty()) " Arguments: $params" else ""
  }
  return (
    listOf(
      "## Calling tools",
      "You can act on the workspace by calling the tools listed below. If your runtime",
      "supports native function/tool calling, use it. Otherwise, call a tool by writing",
      "a line in EXACTLY this format (raw, not inside a code fence):",
      "<tool_call>{\"name\": \"<tool-name>\", \"arguments\": { ...json args... }}</tool_call>",
      "Rules:",
      "- Emit a <tool_call> only to run a tool; keep the JSON on a single line.",
      "- You may emit several <tool_call> lines to run multiple tools.",
      "- After emitting tool call(s), STOP — wait for the results before continuing.",
      "- When the task is done, reply normally with NO <tool_call>.",
      "Available tools:",
    ) + lines
  ).joinToString("\n")
}

/** Compact one-line summary of a tool's JSON-schema arguments for the prompt. */
private fun describeToolParams(parameters: JsonObject): String {
  val properties = parameters["properties"] as? JsonObject ?: return ""
  if (properties.isEmpty()) return ""
  val required =
    (parameters["required"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull }?.toSet()
      ?: emptySet()
  return properties.entries.joinToString(", ") { (key, value) ->
    val type = (value as? JsonObject)?.get("type")?.jsonPrimitive?.contentOrNull ?: "any"
    "$key${if (key in required) "" else "?"}: $type"
  }
}

object ReadFileTool : AgentTool {
  override val name = "read_file"
  override val description =
    "Read a UTF-8 text file from the workspace. Returns the contents with line " +
      "numbers. Use offset/limit to read a slice of a large file."
  override val risk = ToolRisk.SAFE
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") { add("path") }
    putJsonObject("properties") {
      putJsonObject("path") {
        put("type", "string")
        put("description", "Workspace-relative or absolute file path.")
      }
      putJsonObject("offset") {
        put("type", "number")
        put("description", "1-based line to start at (default 1).")
      }
      putJsonObject("limit") {
        put("type", "number")
        put("description", "Maximum number of lines to read.")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val path = args.string("path") ?: return fail("Missing required argument \"path\".")
    val content =
      try {
        host.readFile(path)
      } catch (error: Exception) {
        return fail("Could not read $path: ${error.message ?: error}")
      }

    val lines = content.split("\n")
    val offset = maxOf(1, args.int("offset") ?: 1)
    val limit = args.int("limit")
    val start = offset - 1
    val end = if (limit == null) lines.size else minOf(lines.size, start + limit)
    if (start >= lines.size || start < 0 || start >= end) {
      return ToolResult("$path is empty or the requested range is out of bounds.")
    }

    val numbered =
      lines.subList(start, end).mapIndexed { index, line ->
        "${(start + index + 1).toString().padStart(6)}\t$line"
      }.joinToString("\n")
    return ToolResult(truncate(numbered))
  }
}

object WriteFileTool : AgentTool {
  override val name = "write_file"
  override val description =
    "Create a new file or overwrite an existing one with the given contents. " +
      "Parent directories are created as needed."
  override val risk = ToolRisk.MUTATING
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") {
      add("path")
      add("content")
    }
    putJsonObject("properties") {
      putJsonObject("path") {
        put("type", "string")
        put("description", "Workspace-relative or absolute file path.")
      }
      putJsonObject("content") {
        put("type", "string")
        put("description", "Full UTF-8 contents to write.")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val path = args.string("path") ?: return fail("Missing required argument \"path\".")
    val content = args.string("content") ?: ""
    return try {
      host.writeFile(path, content)
      val lineCount = if (content.isEmpty()) 0 else content.split("\n").size
      ToolResult("Wrote $path ($lineCount lines, ${content.length} characters).")
    } catch (error: Exception) {
      fail("Could not write $path: ${error.message ?: error}")
    }
  }

  override fun preview(args: JsonObject, host: AgentHost): String {
    val path = args.string("path") ?: "?"
    val content = args.string("content") ?: ""
    var current = ""
    var exists = true
    try {
      current = host.readFile(path)
    } catch (error: Exception) {
      exists = false
    }
    val verb = if (exists) "Overwrite" else "Create"
    return "$verb $path\n\n${diffLines(current, content)}"
  }
}

object EditFileTool : AgentTool {
  override val name = "edit_file"
  override val description =
    "Replace an exact string in a file. `old_string` must appear exactly once " +
      "unless replace_all is true. Use this for surgical changes instead of " +
      "rewriting the whole file."
  override val risk = ToolRisk.MUTATING
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") {
      add("path")
      add("old_string")
      add("new_string")
    }
    putJsonObject("properties") {
      putJsonObject("path") {
        put("type", "string")
        put("description", "Workspace-relative or absolute file path.")
      }
      putJsonObject("old_string") {
        put("type", "string")
        put("description", "Exact text to replace.")
      }
      putJsonObject("new_string") {
        put("type", "string")
        put("description", "Replacement text.")
      }
      putJsonObject("replace_all") {
        put("type", "boolean")
        put("description", "Replace every occurrence instead of requiring uniqueness.")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val path = args.string("path") ?: return fail("Missing required argument \"path\".")
    val oldString = args.string("old_string") ?: return fail("Missing required argument \"old_string\".")
    val newString = args.string("new_string") ?: ""
    val replaceAll = args.bool("replace_all") ?: false

    if (oldString == newString) {
      return fail("old_string and new_string are identical; nothing to change.")
    }

    val content =
      try {
        host.readFile(path)
      } catch (error: Exception) {
        return fail("Could not read $path: ${error.message ?: error}")
      }

    val occurrences = content.split(oldString).size - 1
    if (occurrences == 0) {
      return fail("old_string was not found in $path.")
    }
    if (occurrences > 1 && !replaceAll) {
      return fail("old_string appears $occurrences times in $path; make it unique or set replace_all.")
    }

    val updated =
      if (replaceAll) content.replace(oldString, newString)
      else content.replaceFirst(oldString, newString)

    return try {
      host.writeFile(path, updated)
      val replaced = if (replaceAll) occurrences else 1
      ToolResult("Edited $path ($replaced replacement${if (replaced == 1) "" else "s"}).")
    } catch (error: Exception) {
      fail("Could not write $path: ${error.message ?: error}")
    }
  }

  override fun preview(args: JsonObject, host: AgentHost): String {
    val path = args.string("path") ?: "?"
    val oldString = args.string("old_string") ?: ""
    val newString = args.string("new_string") ?: ""
    return "Edit $path\n\n${diffLines(oldString, newString)}"
  }
}

object BashTool : AgentTool {
  override val name = "bash"
  override val description =
    "Run a shell command in the workspace root and return its combined output. " +
      "Use this for tests, builds, git, search, and anything the terminal can do."
  override val risk = ToolRisk.MUTATING
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") { add("command") }
    putJsonObject("properties") {
      putJsonObject("command") {
        put("type", "string")
        put("description", "The shell command to run.")
      }
      putJsonObject("timeout_ms") {
        put("type", "number")
        put("description", "Timeout in milliseconds (default $DEFAULT_BASH_TIMEOUT_MS).")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val command = args.string("command") ?: return fail("Missing required argument \"command\".")
    val timeoutMs = args.int("timeout_ms")?.toLong() ?: DEFAULT_BASH_TIMEOUT_MS

    val result =
      try {
        host.exec(command, timeoutMs)
      } catch (error: Exception) {
        return fail("Command failed to start: ${error.message ?: error}")
      }

    val sections = mutableListOf<String>()
    if (result.stdout.isNotEmpty()) sections.add(result.stdout.trimEnd())
    if (result.stderr.isNotEmpty()) sections.add("[stderr]\n${result.stderr.trimEnd()}")
    val body = if (sections.isEmpty()) "(no output)" else sections.joinToString("\n\n")
    val status = "[exit code: ${result.exitCode ?: "killed"}]"
    val content = truncate("$body\n$status")
    return ToolResult(content, isError = result.exitCode != 0)
  }
}

object GlobTool : AgentTool {
  override val name = "glob"
  override val description =
    "Find files whose path matches a glob pattern (e.g. \"src/**/*.kt\"). " +
      "Returns matching workspace-relative paths."
  override val risk = ToolRisk.SAFE
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") { add("pattern") }
    putJsonObject("properties") {
      putJsonObject("pattern") {
        put("type", "string")
        put("description", "Glob pattern relative to the workspace root.")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val pattern = args.string("pattern") ?: return fail("Missing required argument \"pattern\".")
    val paths =
      try {
        host.glob(pattern)
      } catch (error: Exception) {
        return fail("glob failed: ${error.message ?: error}")
      }
    if (paths.isEmpty()) return ToolResult("No files match $pattern.")
    val capped = paths.take(MAX_GLOB_RESULTS)
    val more = if (paths.size > capped.size) "\n... and ${paths.size - capped.size} more" else ""
    return ToolResult(truncate(capped.joinToString("\n") + more))
  }
}

object ListDirTool : AgentTool {
  override val name = "list_dir"
  override val description =
    "List the files and subdirectories of a directory (defaults to the workspace root)."
  override val risk = ToolRisk.SAFE
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") {}
    putJsonObject("properties") {
      putJsonObject("path") {
        put("type", "string")
        put("description", "Directory path (default: workspace root).")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val path = args.string("path")?.takeIf { it.isNotEmpty() } ?: "."
    val entries =
      try {
        host.listDir(path)
      } catch (error: Exception) {
        return fail("Could not list $path: ${error.message ?: error}")
      }
    if (entries.isEmpty()) return ToolResult("$path is empty.")
    val rendered =
      entries.map { if (it.isDirectory) "${it.name}/" else it.name }.sorted().joinToString("\n")
    return ToolResult(truncate(rendered))
  }
}

object GrepTool : AgentTool {
  override val name = "grep"
  override val description =
    "Search file contents for a regular expression. Returns matches as " +
      "\"path:line: text\". Narrow the search with the glob argument."
  override val risk = ToolRisk.SAFE
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") { add("pattern") }
    putJsonObject("properties") {
      putJsonObject("pattern") {
        put("type", "string")
        put("description", "Regular expression to search for.")
      }
      putJsonObject("glob") {
        put("type", "string")
        put("description", "Glob limiting which files are searched (default \"**/*\").")
      }
      putJsonObject("case_insensitive") {
        put("type", "boolean")
        put("description", "Match case-insensitively.")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val pattern = args.string("pattern") ?: return fail("Missing required argument \"pattern\".")
    val globPattern = args.string("glob")?.takeIf { it.isNotEmpty() } ?: "**/*"
    val options = if (args.bool("case_insensitive") == true) setOf(RegexOption.IGNORE_CASE) else emptySet()
    val regex =
      try {
        Regex(pattern, options)
      } catch (error: Exception) {
        return fail("Invalid regular expression: ${error.message ?: error}")
      }

    val files =
      try {
        host.glob(globPattern)
      } catch (error: Exception) {
        return fail("grep failed: ${error.message ?: error}")
      }

    val results = ArrayList<String>()
    var scanned = 0
    for (file in files) {
      if (scanned >= MAX_GREP_FILES || results.size >= MAX_GREP_MATCHES) break
      scanned++
      val content =
        try {
          host.readFile(file)
        } catch (error: Exception) {
          continue
        }
      if (content.contains('\u0000')) continue // looks binary
      content.split("\n").forEachIndexed { index, line ->
        if (results.size < MAX_GREP_MATCHES && regex.containsMatchIn(line)) {
          results.add("$file:${index + 1}: ${line.trim()}")
        }
      }
    }

    if (results.isEmpty()) return ToolResult("No matches for /$pattern/.")
    val note = if (results.size >= MAX_GREP_MATCHES) "\n... (stopped at $MAX_GREP_MATCHES matches)" else ""
    return ToolResult(truncate(results.joinToString("\n") + note))
  }
}

object TodoWriteTool : AgentTool {
  override val name = "todo_write"
  override val description =
    "Record or update your task list for this job. Pass the full list each " +
      "time. Use it to plan and track multi-step work so you don't lose the thread."
  override val risk = ToolRisk.SAFE
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") { add("todos") }
    putJsonObject("properties") {
      putJsonObject("todos") {
        put("type", "array")
        put("description", "The full task list.")
        putJsonObject("items") {
          put("type", "object")
          put("additionalProperties", false)
          putJsonArray("required") {
            add("content")
            add("status")
          }
          putJsonObject("properties") {
            putJsonObject("content") { put("type", "string") }
            putJsonObject("status") {
              put("type", "string")
              putJsonArray("enum") {
                add("pending")
                add("in_progress")
                add("completed")
              }
            }
          }
        }
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val todos = args["todos"] as? JsonArray ?: return ToolResult("Task list cleared.")
    if (todos.isEmpty()) return ToolResult("Task list cleared.")
    val rendered =
      todos.joinToString("\n") { element ->
        val item = element.jsonObject
        val content = item.string("content") ?: ""
        val marker =
          when (item.string("status")) {
            "completed" -> "[x]"
            "in_progress" -> "[~]"
            else -> "[ ]"
          }
        "$marker $content"
      }
    return ToolResult(rendered)
  }
}

private fun fail(message: String): ToolResult = ToolResult(message, isError = true)

private fun truncate(text: String, limit: Int = MAX_TOOL_OUTPUT_CHARS): String =
  if (text.length <= limit) text
  else "${text.substring(0, limit)}\n... [truncated ${text.length - limit} characters]"

private fun JsonObject.string(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull

private fun JsonObject.int(key: String): Int? = this[key]?.jsonPrimitive?.intOrNull

private fun JsonObject.bool(key: String): Boolean? = this[key]?.jsonPrimitive?.booleanOrNull
