package ai.codesetu.actions

import ai.codesetu.toolwindow.CodeSetuChatService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent

/**
 * Undo the file edits made by the most recent CodeSetu agent turn, restoring
 * each touched file to its pre-turn state. Structured edits only — `bash` side
 * effects are not tracked.
 */
class RevertLastAgentEditsAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    CodeSetuChatService.getInstance(project).revertLastAgentEdits()
  }
}
