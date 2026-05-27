package ai.codesetu.apiclient.store

import ai.codesetu.apiclient.model.Collection
import ai.codesetu.apiclient.model.Environment
import ai.codesetu.apiclient.model.Variable
import kotlinx.serialization.Serializable

/** Mirror of the VSCode PersistedState (apps/vscode-apiclient/src/protocol.ts). */
@Serializable
data class ApiClientState(
  val collections: List<Collection> = emptyList(),
  val environments: List<Environment> = emptyList(),
  val globals: List<Variable> = emptyList(),
  val activeEnvironmentId: String? = null,
  val history: List<HistoryEntry> = emptyList(),
)

@Serializable
data class HistoryEntry(
  val id: String,
  val at: Long,
  val method: String,
  val url: String,
  val status: Int? = null,
  val ok: Boolean? = null,
  val durationMs: Long? = null,
)
