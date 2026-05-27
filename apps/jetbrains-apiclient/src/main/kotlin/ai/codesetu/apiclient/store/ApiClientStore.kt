package ai.codesetu.apiclient.store

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Application-level persistence for the API Client. The model contains
 * polymorphic (sealed) nodes that IntelliJ's XML serializer cannot handle, so
 * the whole state is stored as a kotlinx JSON string.
 */
@Service(Service.Level.APP)
@State(name = "CodeSetuApiClient", storages = [Storage("codesetu-api-client.xml")])
class ApiClientStore : PersistentStateComponent<ApiClientStore.State> {
  class State {
    var json: String = ""
  }

  private var state = State()

  override fun getState(): State = state

  override fun loadState(state: State) {
    this.state = state
  }

  fun load(): ApiClientState =
    if (state.json.isBlank()) {
      ApiClientState()
    } else {
      runCatching { JSON.decodeFromString<ApiClientState>(state.json) }.getOrElse { ApiClientState() }
    }

  fun save(value: ApiClientState) {
    state.json = JSON.encodeToString(value)
  }

  companion object {
    private val JSON = Json {
      ignoreUnknownKeys = true
      encodeDefaults = true
    }

    fun getInstance(): ApiClientStore =
      ApplicationManager.getApplication().getService(ApiClientStore::class.java)
  }
}
