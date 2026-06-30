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
  private var embeddingBaseUrl = settings.state.embeddingBaseUrl
  private var embeddingModel = settings.state.embeddingModel
  private var workspaceAutoReindex = settings.state.workspaceAutoReindex
  private var workspaceAlwaysRetrieve = settings.state.workspaceAlwaysRetrieve
  private var speechSttProvider = settings.state.speechSttProvider
  private var speechLanguage = settings.state.speechLanguage
  private var speechSttBaseUrl = settings.state.speechSttBaseUrl
  private var speechSttModel = settings.state.speechSttModel
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
    group("@workspace (codebase index)") {
      row("Embedding base URL") { textField().bindText(::embeddingBaseUrl) }
      row("Embedding model") { textField().bindText(::embeddingModel) }
      row {
        checkBox("Auto re-index a short delay after saving a file")
          .bindSelected(::workspaceAutoReindex)
      }
      row {
        checkBox("Always retrieve from the index every turn (not only with @workspace)")
          .bindSelected(::workspaceAlwaysRetrieve)
      }
    }
    group("Speech (voice in)") {
      row("STT provider") { textField().bindText(::speechSttProvider) }
      row("Language (BCP-47)") { textField().bindText(::speechLanguage) }
      row("STT base URL") { textField().bindText(::speechSttBaseUrl) }
      row("STT model") { textField().bindText(::speechSttModel) }
      row("Speech API key") { passwordField().bindText(::speechApiKey) }
    }
  }

  override fun isModified(): Boolean =
    provider != settings.state.provider ||
      baseUrl != settings.state.baseUrl ||
      model != settings.state.model ||
      apiKey != settings.getApiKey() ||
      skillsAutoRoute != settings.state.skillsAutoRoute ||
      embeddingBaseUrl != settings.state.embeddingBaseUrl ||
      embeddingModel != settings.state.embeddingModel ||
      workspaceAutoReindex != settings.state.workspaceAutoReindex ||
      workspaceAlwaysRetrieve != settings.state.workspaceAlwaysRetrieve ||
      speechSttProvider != settings.state.speechSttProvider ||
      speechLanguage != settings.state.speechLanguage ||
      speechSttBaseUrl != settings.state.speechSttBaseUrl ||
      speechSttModel != settings.state.speechSttModel ||
      speechApiKey != settings.getSpeechApiKey()

  override fun apply() {
    settings.state.provider = provider.trim()
    settings.state.baseUrl = baseUrl.trim()
    settings.state.model = model.trim()
    settings.setApiKey(apiKey)
    settings.state.skillsAutoRoute = skillsAutoRoute
    settings.state.embeddingBaseUrl = embeddingBaseUrl.trim()
    settings.state.embeddingModel = embeddingModel.trim()
    settings.state.workspaceAutoReindex = workspaceAutoReindex
    settings.state.workspaceAlwaysRetrieve = workspaceAlwaysRetrieve
    settings.state.speechSttProvider = speechSttProvider.trim().ifBlank { "browser" }
    settings.state.speechLanguage = speechLanguage.trim().ifBlank { "en-US" }
    settings.state.speechSttBaseUrl = speechSttBaseUrl.trim()
    settings.state.speechSttModel = speechSttModel.trim()
    settings.setSpeechApiKey(speechApiKey)
  }

  override fun reset() {
    provider = settings.state.provider
    baseUrl = settings.state.baseUrl
    model = settings.state.model
    apiKey = settings.getApiKey()
    skillsAutoRoute = settings.state.skillsAutoRoute
    embeddingBaseUrl = settings.state.embeddingBaseUrl
    embeddingModel = settings.state.embeddingModel
    workspaceAutoReindex = settings.state.workspaceAutoReindex
    workspaceAlwaysRetrieve = settings.state.workspaceAlwaysRetrieve
    speechSttProvider = settings.state.speechSttProvider
    speechLanguage = settings.state.speechLanguage
    speechSttBaseUrl = settings.state.speechSttBaseUrl
    speechSttModel = settings.state.speechSttModel
    speechApiKey = settings.getSpeechApiKey()
  }
}
