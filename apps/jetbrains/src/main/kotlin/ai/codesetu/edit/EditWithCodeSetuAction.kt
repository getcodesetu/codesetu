package ai.codesetu.edit

import ai.codesetu.model.ChatMessage
import ai.codesetu.provider.CodeSetuProviderClient
import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Document
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.TextRange

/**
 * "Edit with CodeSetu": prompt for an instruction, ask the model to rewrite the
 * selection (or whole file), show the change as a diff, and apply it only if the
 * user accepts. Mirrors the VS Code `/edit` command.
 */
class EditWithCodeSetuAction : AnAction() {
  private val client = CodeSetuProviderClient()

  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val editor =
      FileEditorManager.getInstance(project).selectedTextEditor ?: e.getData(CommonDataKeys.EDITOR)
    if (editor == null) {
      warn(project, "Open a file (and optionally select code) before running Edit with CodeSetu.")
      return
    }

    val document = editor.document
    val selection = editor.selectionModel
    val hasSelection = selection.hasSelection()
    val start = if (hasSelection) selection.selectionStart else 0
    val end = if (hasSelection) selection.selectionEnd else document.textLength
    val target = document.getText(TextRange(start, end))
    if (target.isBlank()) {
      warn(project, "Nothing to edit — the selection/file is empty.")
      return
    }

    val instruction =
      Messages.showInputDialog(
        project,
        if (hasSelection) "Describe the change for the selection" else "Describe the change for the whole file",
        "Edit with CodeSetu",
        null,
        "",
        null,
      )
    if (instruction.isNullOrBlank()) return

    // Capture everything we need on the EDT before going to a background thread.
    val originalFull = document.text
    val vfile = FileDocumentManager.getInstance().getFile(document)
    val fileType = vfile?.fileType
    val languageId = vfile?.extension

    ApplicationManager.getApplication().executeOnPooledThread {
      val newCode =
        try {
          val messages =
            listOf(
              ChatMessage("system", EDIT_SYSTEM_PROMPT),
              ChatMessage("user", buildEditUserMessage(languageId, target, instruction)),
            )
          stripCodeFences(client.chat(messages))
        } catch (error: Exception) {
          ApplicationManager.getApplication().invokeLater {
            Messages.showErrorDialog(project, "CodeSetu edit failed: ${error.message ?: error}", "CodeSetu")
          }
          return@executeOnPooledThread
        }

      if (newCode.isBlank()) {
        ApplicationManager.getApplication().invokeLater { warn(project, "CodeSetu returned no edit.") }
        return@executeOnPooledThread
      }

      val proposedFull = originalFull.substring(0, start) + newCode + originalFull.substring(end)
      ApplicationManager.getApplication().invokeLater {
        reviewAndApply(project, document, fileType, originalFull, proposedFull, start, end, newCode)
      }
    }
  }

  private fun reviewAndApply(
    project: Project,
    document: Document,
    fileType: FileType?,
    originalFull: String,
    proposedFull: String,
    start: Int,
    end: Int,
    newCode: String,
  ) {
    val factory = DiffContentFactory.getInstance()
    val left = if (fileType != null) factory.create(project, originalFull, fileType) else factory.create(project, originalFull)
    val right = if (fileType != null) factory.create(project, proposedFull, fileType) else factory.create(project, proposedFull)
    DiffManager.getInstance()
      .showDiff(project, SimpleDiffRequest("CodeSetu edit — review", left, right, "Current", "CodeSetu edit"))

    val choice =
      Messages.showYesNoDialog(
        project,
        "Apply this CodeSetu edit?",
        "Edit with CodeSetu",
        "Apply",
        "Discard",
        Messages.getQuestionIcon(),
      )
    if (choice != Messages.YES) return

    // Guard the range in case the document shifted while the dialog was open.
    val safeEnd = minOf(end, document.textLength)
    val safeStart = minOf(start, safeEnd)
    WriteCommandAction.runWriteCommandAction(project) {
      document.replaceString(safeStart, safeEnd, newCode)
    }
  }

  private fun warn(project: Project, message: String) {
    Messages.showWarningDialog(project, message, "CodeSetu")
  }
}
