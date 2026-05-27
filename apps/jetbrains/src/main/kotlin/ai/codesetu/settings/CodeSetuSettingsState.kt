package ai.codesetu.settings

import ai.codesetu.model.ProviderKind
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.APP)
@State(name = "CodeSetuSettings", storages = [Storage("codesetu.xml")])
class CodeSetuSettingsState : PersistentStateComponent<CodeSetuSettingsState.State> {
  data class State(
    var provider: String = ProviderKind.SARVAM.id,
    var baseUrl: String = DEFAULT_CODESETU_BASE_URL,
    var model: String = DEFAULT_CODESETU_MODEL,
    // Legacy plaintext field, kept only so a pre-existing value can be migrated
    // into PasswordSafe on first access. New keys are never persisted here.
    var apiKey: String = "",
  )

  private var state = State()

  override fun getState(): State = state

  override fun loadState(state: State) {
    this.state = state
  }

  /**
   * Returns the provider API key from the secure store, migrating any legacy
   * plaintext value out of the settings XML on first read.
   */
  fun getApiKey(): String {
    val legacy = state.apiKey
    if (legacy.isNotBlank()) {
      CodeSetuApiKeyStore.set(legacy)
      state.apiKey = ""
    }
    return CodeSetuApiKeyStore.get()
  }

  fun setApiKey(value: String) {
    state.apiKey = ""
    CodeSetuApiKeyStore.set(value)
  }

  companion object {
    fun getInstance(): CodeSetuSettingsState =
      ApplicationManager.getApplication().getService(CodeSetuSettingsState::class.java)
  }
}
