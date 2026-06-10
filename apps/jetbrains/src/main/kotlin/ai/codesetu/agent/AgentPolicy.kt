package ai.codesetu.agent

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject

/**
 * Project-level agent policy from `.codesetu/agent.json`. Committable so a team
 * can share one approval policy. Patterns are regular expressions tested against
 * the trimmed shell command. Mirrors AgentPolicy in @codesetu/core.
 */
data class AgentPolicy(
  val maxIterations: Int?,
  val autoApproveCommands: List<String>,
  val denyCommands: List<String>,
)

/** Parse a `.codesetu/agent.json` document, tolerating malformed input. */
fun parseAgentPolicy(text: String): AgentPolicy {
  val obj =
    try {
      Json.parseToJsonElement(text).jsonObject
    } catch (error: Exception) {
      return AgentPolicy(null, emptyList(), emptyList())
    }
  val maxIterations = (obj["maxIterations"] as? JsonPrimitive)?.intOrNull?.takeIf { it > 0 }
  return AgentPolicy(maxIterations, stringArray(obj, "autoApproveCommands"), stringArray(obj, "denyCommands"))
}

/**
 * Build the loop's policy gate. Only `bash` is policy-controlled; other mutating
 * tools always prompt. Deny is checked before allow, so it wins.
 */
fun createBashCommandPolicy(policy: AgentPolicy): (AgentTool, JsonObject) -> String {
  val deny = policy.denyCommands.mapNotNull { runCatching { Regex(it) }.getOrNull() }
  val allow = policy.autoApproveCommands.mapNotNull { runCatching { Regex(it) }.getOrNull() }
  return { tool, args ->
    if (tool.name != "bash") {
      "prompt"
    } else {
      val command = (args["command"] as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
      when {
        command.isEmpty() -> "prompt"
        deny.any { it.containsMatchIn(command) } -> "deny"
        allow.any { it.containsMatchIn(command) } -> "allow"
        else -> "prompt"
      }
    }
  }
}

private fun stringArray(obj: JsonObject, key: String): List<String> =
  (obj[key] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList()
