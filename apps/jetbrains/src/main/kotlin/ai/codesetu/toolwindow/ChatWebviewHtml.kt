package ai.codesetu.toolwindow

import ai.codesetu.settings.CodeSetuSettingsState
import ai.codesetu.skills.BUILTIN_SKILLS
import java.net.URI
import java.nio.charset.StandardCharsets

/**
 * Loads the shared chat webview template from resources and substitutes the
 * theme, model label, the JCEF post-bridge snippet, the slash-command JSON,
 * and the speech config / CSP connect-src allowlist.
 */
object ChatWebviewHtml {
  private val template: String by lazy {
    ChatWebviewHtml::class.java.getResourceAsStream("/webview/chat.html")
      ?.use { String(it.readAllBytes(), StandardCharsets.UTF_8) }
      ?: error("Missing /webview/chat.html resource")
  }

  fun render(modelLabel: String, bridgePostJs: String): String {
    val speech = CodeSetuSettingsState.getInstance().state
    return template
      .replace("__THEME_CSS__", ChatTheme.rootCss())
      .replace("__MODEL_LABEL__", escapeHtml(modelLabel))
      .replace("__BRIDGE_POST__", bridgePostJs)
      .replace("__SLASH_COMMANDS_JSON__", slashCommandsJson())
      .replace("__SPEECH_CONFIG_JSON__", speechConfigJson(speech))
      .replace("__SPEECH_CONNECT_SOURCES__", speechConnectSources(speech))
  }

  private fun speechConfigJson(state: CodeSetuSettingsState.State): String =
    "{\"sttProvider\":${jsonString(state.speechSttProvider)}," +
      "\"ttsProvider\":${jsonString(state.speechTtsProvider)}," +
      "\"language\":${jsonString(state.speechLanguage)}," +
      "\"ttsEnabled\":${state.speechTtsEnabled}}"

  private fun speechConnectSources(state: CodeSetuSettingsState.State): String {
    val origins = linkedSetOf<String>("'self'")
    listOf(state.speechSttBaseUrl, state.speechTtsBaseUrl).forEach { url ->
      if (url.isNotBlank()) {
        runCatching { URI.create(url) }
          .getOrNull()
          ?.let { uri ->
            val scheme = uri.scheme ?: return@let
            val host = uri.host ?: return@let
            val port = if (uri.port == -1) "" else ":${uri.port}"
            origins += "$scheme://$host$port"
          }
      }
    }
    if (state.speechSttProvider == "sarvam" || state.speechTtsProvider == "sarvam") {
      origins += "https://api.sarvam.ai"
    }
    if (state.speechSttProvider == "huggingface" || state.speechTtsProvider == "huggingface") {
      origins += "https://router.huggingface.co"
      origins += "https://api-inference.huggingface.co"
    }
    return origins.joinToString(" ")
  }

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
