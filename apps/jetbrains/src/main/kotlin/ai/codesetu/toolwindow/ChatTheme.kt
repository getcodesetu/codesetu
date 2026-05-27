package ai.codesetu.toolwindow

import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.ui.ColorUtil
import com.intellij.ui.JBColor
import com.intellij.util.ui.UIUtil
import java.awt.Color

/**
 * Maps the current IDE theme onto the `--vscode-*` CSS variables the shared chat
 * design expects, so the JCEF webview matches the IDE's light/dark theme.
 */
object ChatTheme {
  fun rootCss(): String {
    val foreground = UIUtil.getLabelForeground()
    val panelBackground = UIUtil.getPanelBackground()
    val accent = "#3574F0"

    val vars = linkedMapOf(
      "--vscode-font-family" to "${UIUtil.getLabelFont().family}, sans-serif",
      "--vscode-foreground" to hex(foreground),
      "--vscode-editor-background" to hex(panelBackground),
      "--vscode-input-background" to hex(UIUtil.getTextFieldBackground()),
      "--vscode-input-foreground" to hex(UIUtil.getTextFieldForeground()),
      "--vscode-input-placeholderForeground" to hex(UIUtil.getContextHelpForeground()),
      "--vscode-input-border" to hex(JBColor.border()),
      "--vscode-widget-border" to hex(JBColor.border()),
      "--vscode-focusBorder" to accent,
      "--vscode-editor-inactiveSelectionBackground" to
        hex(ColorUtil.mix(panelBackground, foreground, 0.05)),
      "--vscode-textCodeBlock-background" to hex(ColorUtil.mix(panelBackground, foreground, 0.10)),
      "--vscode-button-background" to accent,
      "--vscode-button-foreground" to "#ffffff",
      "--vscode-button-hoverBackground" to accent,
      "--vscode-descriptionForeground" to hex(UIUtil.getContextHelpForeground()),
      "--vscode-toolbar-hoverBackground" to hex(ColorUtil.mix(panelBackground, foreground, 0.08)),
      "--vscode-menu-background" to hex(UIUtil.getListBackground()),
      "--vscode-menu-foreground" to hex(UIUtil.getListForeground()),
      "--vscode-editorWidget-background" to hex(UIUtil.getListBackground()),
      "--vscode-inputValidation-errorBackground" to
        hex(JBColor(Color(0xFFEBE9), Color(0x5A1D1D))),
      "--vscode-inputValidation-errorBorder" to hex(JBColor(Color(0xE5534B), Color(0xE5534B))),
      "--vscode-inputOption-activeBorder" to accent,
      "--vscode-editor-font-family" to
        "${EditorColorsManager.getInstance().globalScheme.editorFontName}, monospace",
    )

    val body = vars.entries.joinToString("\n") { (name, value) -> "        $name: $value;" }
    return ":root {\n$body\n      }"
  }

  private fun hex(color: Color): String = "#%02x%02x%02x".format(color.red, color.green, color.blue)
}
