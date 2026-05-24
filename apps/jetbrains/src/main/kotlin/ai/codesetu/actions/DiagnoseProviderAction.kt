package ai.codesetu.actions

import ai.codesetu.provider.runProviderDiagnostic
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.Messages

class DiagnoseProviderAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return

    ApplicationManager.getApplication().executeOnPooledThread {
      val result = runProviderDiagnostic()
      ApplicationManager.getApplication().invokeLater {
        if (result.status == "ok") {
          Messages.showInfoMessage(
            project,
            "CodeSetu provider connection succeeded in ${result.latencyMs ?: 0}ms.",
            "CodeSetu",
          )
        } else {
          Messages.showWarningDialog(project, result.message, "CodeSetu Provider Diagnostic")
        }
      }
    }
  }
}
