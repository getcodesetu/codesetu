package ai.codesetu.agent

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
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
}

const val MAX_TOOL_OUTPUT_CHARS = 30_000
const val DEFAULT_BASH_TIMEOUT_MS = 120_000L

/** The four primitive tools, in the order presented to the model. */
fun defaultAgentTools(): List<AgentTool> = listOf(ReadFileTool, WriteFileTool, EditFileTool, BashTool)

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

private fun fail(message: String): ToolResult = ToolResult(message, isError = true)

private fun truncate(text: String, limit: Int = MAX_TOOL_OUTPUT_CHARS): String =
  if (text.length <= limit) text
  else "${text.substring(0, limit)}\n... [truncated ${text.length - limit} characters]"

private fun JsonObject.string(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull

private fun JsonObject.int(key: String): Int? = this[key]?.jsonPrimitive?.intOrNull

private fun JsonObject.bool(key: String): Boolean? = this[key]?.jsonPrimitive?.booleanOrNull
