package ai.codesetu.retrieval

import ai.codesetu.agent.AgentHost
import ai.codesetu.agent.AgentTool
import ai.codesetu.agent.ToolResult
import ai.codesetu.agent.ToolRisk
import java.util.Locale
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

private const val MAX_SEARCH_OUTPUT_CHARS = 12_000

/**
 * A safe `search_workspace` agent tool over a prebuilt index — lets the agent
 * retrieve semantically-relevant code by meaning instead of burning iterations
 * on grep/glob guesses. Only added when an index is available, so it is absent
 * (rather than failing) on an unindexed workspace. Kotlin mirror of the
 * TypeScript `createSearchWorkspaceTool`.
 */
class SearchWorkspaceTool(
  private val retrieve: (String, Int) -> List<RetrievedChunk>,
  private val defaultK: Int = DEFAULT_RETRIEVAL_K,
) : AgentTool {
  override val name = "search_workspace"
  override val description =
    "Semantic search over the indexed workspace. Given a natural-language query " +
      "(e.g. 'where do we validate the auth token'), returns the most relevant code " +
      "chunks as path:startLine-endLine plus the snippet. Prefer this over grep when " +
      "you don't know the exact text to match."
  override val risk = ToolRisk.SAFE
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") { add("query") }
    putJsonObject("properties") {
      putJsonObject("query") {
        put("type", "string")
        put("description", "Natural-language description of what to find.")
      }
      putJsonObject("k") {
        put("type", "number")
        put("description", "Max results to return (default $defaultK).")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val query = args["query"]?.jsonPrimitive?.contentOrNull
    if (query.isNullOrBlank()) {
      return ToolResult("Missing required string argument \"query\".", isError = true)
    }
    val k = (args["k"]?.jsonPrimitive?.intOrNull ?: defaultK).coerceAtLeast(1)
    val hits =
      try {
        retrieve(query, k)
      } catch (error: Exception) {
        return ToolResult("Workspace search failed: ${error.message ?: error}", isError = true)
      }
    if (hits.isEmpty()) {
      return ToolResult("No indexed matches. The workspace index may be empty — fall back to grep/glob.")
    }
    val formatted = hits.joinToString("\n\n") { hit ->
      "${hit.path}:${hit.startLine}-${hit.endLine} (score ${String.format(Locale.US, "%.3f", hit.score)})\n${hit.text}"
    }
    val capped =
      if (formatted.length <= MAX_SEARCH_OUTPUT_CHARS) formatted
      else formatted.take(MAX_SEARCH_OUTPUT_CHARS) + "\n... [truncated]"
    return ToolResult(capped)
  }
}
