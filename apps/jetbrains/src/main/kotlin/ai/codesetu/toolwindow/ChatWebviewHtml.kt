package ai.codesetu.toolwindow

import ai.codesetu.skills.BUILTIN_SKILLS
import java.nio.charset.StandardCharsets

/**
 * Loads the shared chat webview template from resources and substitutes the
 * theme, model label, the JCEF post-bridge snippet, and the slash-command JSON.
 */
object ChatWebviewHtml {
  private val template: String by lazy {
    ChatWebviewHtml::class.java.getResourceAsStream("/webview/chat.html")
      ?.use { String(it.readAllBytes(), StandardCharsets.UTF_8) }
      ?: error("Missing /webview/chat.html resource")
  }

  fun render(modelLabel: String, bridgePostJs: String): String =
    template
      .replace("__THEME_CSS__", ChatTheme.rootCss())
      .replace("__MODEL_LABEL__", escapeHtml(modelLabel))
      .replace("__BRIDGE_POST__", bridgePostJs)
      .replace("__SLASH_COMMANDS_JSON__", slashCommandsJson())

  private fun slashCommandsJson(): String {
    val entries = BUILTIN_SKILLS.flatMap { skill ->
      skill.slashCommands.map { command ->
        Triple(command, skill.instruction.name, skill.instruction.description)
      }
    }
    val items = entries.joinToString(",") { (command, name, description) ->
      "{\"command\":${jsonString(command)},\"skillName\":${jsonString(name)}," +
        "\"description\":${jsonString(description)}}"
    }
    return "[$items]".replace("<", "\\u003c")
  }

  private fun jsonString(value: String): String {
    val escaped = value
      .replace("\\", "\\\\")
      .replace("\"", "\\\"")
      .replace("\n", "\\n")
      .replace("\r", "\\r")
      .replace("\t", "\\t")
    return "\"$escaped\""
  }

  private fun escapeHtml(value: String): String =
    value
      .replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
}
