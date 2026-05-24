package ai.codesetu.toolwindow

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
class CodeSetuChatService(private val project: Project) {
  private val pendingMessages = mutableListOf<String>()
  private var panel: CodeSetuChatPanel? = null

  fun register(panel: CodeSetuChatPanel) {
    this.panel = panel
    pendingMessages.forEach(panel::sendMessage)
    pendingMessages.clear()
  }

  fun sendMessage(text: String) {
    val currentPanel = panel

    if (currentPanel === null) {
      pendingMessages.add(text)
      return
    }

    currentPanel.sendMessage(text)
  }

  companion object {
    fun getInstance(project: Project): CodeSetuChatService =
      project.getService(CodeSetuChatService::class.java)
  }
}
