package ai.codesetu.toolwindow

import java.nio.charset.StandardCharsets

/**
 * Loads the shared chat webview template from resources and substitutes the
 * theme, model label, and the JCEF post-bridge snippet.
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

  private fun escapeHtml(value: String): String =
    value
      .replace("&", "&amp;")
      .replace("<", "&lt;")
      .replace(">", "&gt;")
      .replace("\"", "&quot;")
}
