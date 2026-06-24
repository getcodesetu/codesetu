package ai.codesetu.actions

import ai.codesetu.retrieval.WorkspaceIndexService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages

/**
 * "Index Workspace": build/refresh the @workspace semantic index in the
 * background, then report a summary. Mirrors the VS Code `codesetu.indexWorkspace`
 * command.
 */
class IndexWorkspaceAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    ProgressManager.getInstance()
      .run(
        object : Task.Backgroundable(project, "CodeSetu: indexing workspace", true) {
          override fun run(indicator: ProgressIndicator) {
            indicator.isIndeterminate = false
            val summary =
              try {
                WorkspaceIndexService.getInstance(project).reindex { done, total ->
                  indicator.fraction = if (total > 0) done.toDouble() / total else 0.0
                  indicator.text = "Embedding $done/$total chunks"
                }
              } catch (error: Exception) {
                notify(project, "CodeSetu indexing failed: ${error.message ?: error}", isError = true)
                return
              }
            notify(project, "CodeSetu: $summary", isError = false)
          }
        },
      )
  }

  private fun notify(project: Project, message: String, isError: Boolean) {
    ApplicationManager.getApplication().invokeLater {
      if (isError) {
        Messages.showErrorDialog(project, message, "CodeSetu")
      } else {
        Messages.showInfoMessage(project, message, "CodeSetu")
      }
    }
  }
}
