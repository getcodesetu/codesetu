package ai.codesetu.actions

import ai.codesetu.context.collectIdeContext
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.IdeActionId
import ai.codesetu.prompts.buildActionUserMessage
import ai.codesetu.toolwindow.CodeSetuChatService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager

abstract class CodeSetuEditorAction(
  private val actionId: IdeActionId,
) : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val message = buildActionUserMessage(
      actionId,
      collectIdeContext(e),
      loadWorkspaceInstructions(project),
    )
    val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("CodeSetu") ?: return
    toolWindow.show {
      CodeSetuChatService.getInstance(project).sendMessage(message)
    }
  }
}

class ExplainSelectionAction : CodeSetuEditorAction(IdeActionId.EXPLAIN)
class RefactorSelectionAction : CodeSetuEditorAction(IdeActionId.REFACTOR)
class WriteTestsForSelectionAction : CodeSetuEditorAction(IdeActionId.WRITE_TESTS)
class FixBugInSelectionAction : CodeSetuEditorAction(IdeActionId.FIX_BUG)
class AddDocsToSelectionAction : CodeSetuEditorAction(IdeActionId.ADD_DOCS)
