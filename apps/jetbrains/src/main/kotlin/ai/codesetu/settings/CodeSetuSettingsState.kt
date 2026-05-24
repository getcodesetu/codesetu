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
    var baseUrl: String = "https://api.sarvam.ai/v1",
    var model: String = "",
    var apiKey: String = "",
  )

  private var state = State()

  override fun getState(): State = state

  override fun loadState(state: State) {
    this.state = state
  }

  companion object {
    fun getInstance(): CodeSetuSettingsState =
      ApplicationManager.getApplication().getService(CodeSetuSettingsState::class.java)
  }
}
