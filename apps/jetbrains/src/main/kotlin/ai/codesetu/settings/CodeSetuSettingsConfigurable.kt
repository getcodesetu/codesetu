package ai.codesetu.settings

import com.intellij.openapi.options.Configurable
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import javax.swing.JComponent

class CodeSetuSettingsConfigurable : Configurable {
  private val settings = CodeSetuSettingsState.getInstance()
  private var provider = settings.state.provider
  private var baseUrl = settings.state.baseUrl
  private var model = settings.state.model
  private var apiKey = settings.getApiKey()

  override fun getDisplayName(): String = "CodeSetu"

  override fun createComponent(): JComponent = panel {
    row("Provider") { textField().bindText(::provider) }
    row("Base URL") { textField().bindText(::baseUrl) }
    row("Model") { textField().bindText(::model) }
    row("API key") { passwordField().bindText(::apiKey) }
  }

  override fun isModified(): Boolean =
    provider != settings.state.provider ||
      baseUrl != settings.state.baseUrl ||
      model != settings.state.model ||
      apiKey != settings.getApiKey()

  override fun apply() {
    settings.state.provider = provider.trim()
    settings.state.baseUrl = baseUrl.trim()
    settings.state.model = model.trim()
    settings.setApiKey(apiKey)
  }

  override fun reset() {
    provider = settings.state.provider
    baseUrl = settings.state.baseUrl
    model = settings.state.model
    apiKey = settings.getApiKey()
  }
}
