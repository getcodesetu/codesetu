package ai.codesetu.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

class OpenChatAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    Messages.showInfoMessage(
      e.project,
      "CodeSetu chat is coming soon. The JetBrains plugin is currently a scaffold — see README for status.",
      "CodeSetu",
    )
  }
}
