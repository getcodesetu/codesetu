package ai.codesetu.toolwindow

import ai.codesetu.model.IdeContextPayload
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
class CodeSetuChatService(private val project: Project) {
  private val pendingMessages = mutableListOf<PendingMessage>()
  private var panel: CodeSetuChatPanel? = null

  fun register(panel: CodeSetuChatPanel) {
    this.panel = panel
    pendingMessages.forEach { panel.sendMessage(it.text, it.ideContext) }
    pendingMessages.clear()
  }

  /** Revert the file edits from the most recent agent turn (no-op if no panel). */
  fun revertLastAgentEdits() {
    panel?.revertLastAgentEdits()
  }

  fun sendMessage(text: String, ideContext: IdeContextPayload? = null) {
    val currentPanel = panel

    if (currentPanel === null) {
      pendingMessages.add(PendingMessage(text, ideContext))
      return
    }

    currentPanel.sendMessage(text, ideContext)
  }

  private data class PendingMessage(
    val text: String,
    val ideContext: IdeContextPayload?,
  )

  companion object {
    fun getInstance(project: Project): CodeSetuChatService =
      project.getService(CodeSetuChatService::class.java)
  }
}
