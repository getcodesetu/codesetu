package ai.codesetu.settings

import com.intellij.openapi.options.Configurable
import com.intellij.ui.dsl.builder.bindSelected
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import javax.swing.JComponent

class CodeSetuSettingsConfigurable : Configurable {
  private val settings = CodeSetuSettingsState.getInstance()
  private var provider = settings.state.provider
  private var baseUrl = settings.state.baseUrl
  private var model = settings.state.model
  private var apiKey = settings.getApiKey()
  private var skillsAutoRoute = settings.state.skillsAutoRoute
  private var speechSttProvider = settings.state.speechSttProvider
  private var speechTtsProvider = settings.state.speechTtsProvider
  private var speechLanguage = settings.state.speechLanguage
  private var speechTtsEnabled = settings.state.speechTtsEnabled
  private var speechSttBaseUrl = settings.state.speechSttBaseUrl
  private var speechSttModel = settings.state.speechSttModel
  private var speechTtsBaseUrl = settings.state.speechTtsBaseUrl
  private var speechTtsModel = settings.state.speechTtsModel
  private var speechApiKey = settings.getSpeechApiKey()

  override fun getDisplayName(): String = "CodeSetu"

  override fun createComponent(): JComponent = panel {
    group("Chat provider") {
      row("Provider") { textField().bindText(::provider) }
      row("Base URL") { textField().bindText(::baseUrl) }
      row("Model") { textField().bindText(::model) }
      row("API key") { passwordField().bindText(::apiKey) }
      row {
        checkBox("Auto-route built-in AI skills by keyword (off = slash invocation only)")
          .bindSelected(::skillsAutoRoute)
      }
    }
    group("Speech (voice in / out)") {
      row("STT provider") { textField().bindText(::speechSttProvider) }
      row("TTS provider") { textField().bindText(::speechTtsProvider) }
      row("Language (BCP-47)") { textField().bindText(::speechLanguage) }
      row { checkBox("Read assistant responses aloud").bindSelected(::speechTtsEnabled) }
      row("STT base URL") { textField().bindText(::speechSttBaseUrl) }
      row("STT model") { textField().bindText(::speechSttModel) }
      row("TTS base URL") { textField().bindText(::speechTtsBaseUrl) }
      row("TTS model") { textField().bindText(::speechTtsModel) }
      row("Speech API key") { passwordField().bindText(::speechApiKey) }
    }
  }

  override fun isModified(): Boolean =
    provider != settings.state.provider ||
      baseUrl != settings.state.baseUrl ||
      model != settings.state.model ||
      apiKey != settings.getApiKey() ||
      skillsAutoRoute != settings.state.skillsAutoRoute ||
      speechSttProvider != settings.state.speechSttProvider ||
      speechTtsProvider != settings.state.speechTtsProvider ||
      speechLanguage != settings.state.speechLanguage ||
      speechTtsEnabled != settings.state.speechTtsEnabled ||
      speechSttBaseUrl != settings.state.speechSttBaseUrl ||
      speechSttModel != settings.state.speechSttModel ||
      speechTtsBaseUrl != settings.state.speechTtsBaseUrl ||
      speechTtsModel != settings.state.speechTtsModel ||
      speechApiKey != settings.getSpeechApiKey()

  override fun apply() {
    settings.state.provider = provider.trim()
    settings.state.baseUrl = baseUrl.trim()
    settings.state.model = model.trim()
    settings.setApiKey(apiKey)
    settings.state.skillsAutoRoute = skillsAutoRoute
    settings.state.speechSttProvider = speechSttProvider.trim().ifBlank { "browser" }
    settings.state.speechTtsProvider = speechTtsProvider.trim().ifBlank { "browser" }
    settings.state.speechLanguage = speechLanguage.trim().ifBlank { "en-US" }
    settings.state.speechTtsEnabled = speechTtsEnabled
    settings.state.speechSttBaseUrl = speechSttBaseUrl.trim()
    settings.state.speechSttModel = speechSttModel.trim()
    settings.state.speechTtsBaseUrl = speechTtsBaseUrl.trim()
    settings.state.speechTtsModel = speechTtsModel.trim()
    settings.setSpeechApiKey(speechApiKey)
  }

  override fun reset() {
    provider = settings.state.provider
    baseUrl = settings.state.baseUrl
    model = settings.state.model
    apiKey = settings.getApiKey()
    skillsAutoRoute = settings.state.skillsAutoRoute
    speechSttProvider = settings.state.speechSttProvider
    speechTtsProvider = settings.state.speechTtsProvider
    speechLanguage = settings.state.speechLanguage
    speechTtsEnabled = settings.state.speechTtsEnabled
    speechSttBaseUrl = settings.state.speechSttBaseUrl
    speechSttModel = settings.state.speechSttModel
    speechTtsBaseUrl = settings.state.speechTtsBaseUrl
    speechTtsModel = settings.state.speechTtsModel
    speechApiKey = settings.getSpeechApiKey()
  }
}
