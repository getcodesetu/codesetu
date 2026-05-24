package ai.codesetu.context

import ai.codesetu.model.IdeContextPayload
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project

fun collectIdeContext(event: AnActionEvent): IdeContextPayload {
  val editor = event.getData(CommonDataKeys.EDITOR)
    ?: return IdeContextPayload()
  val document = editor.document
  val virtualFile = FileDocumentManager.getInstance().getFile(document)
  val selectionModel = editor.selectionModel
  val text = document.text
  val selectionStart = selectionModel.selectionStart.coerceIn(0, text.length)
  val selectionEnd = selectionModel.selectionEnd.coerceIn(selectionStart, text.length)
  val selectedText = text.substring(selectionStart, selectionEnd)
  val cursorPrefix = text.substring((selectionStart - 2_000).coerceAtLeast(0), selectionStart)
  val cursorSuffix = text.substring(selectionEnd, (selectionEnd + 2_000).coerceAtMost(text.length))

  return IdeContextPayload(
    activeFilePath = virtualFile?.path,
    languageId = virtualFile?.fileType?.name?.lowercase(),
    selectedText = selectedText,
    activeFileText = trimMiddle(text, 12_000),
    cursorPrefix = cursorPrefix,
    cursorSuffix = cursorSuffix,
  )
}

fun collectIdeContext(project: Project): IdeContextPayload {
  val editor = FileEditorManager.getInstance(project).selectedTextEditor
    ?: return IdeContextPayload()
  val document = editor.document
  val virtualFile = FileDocumentManager.getInstance().getFile(document)
  val caretOffset = editor.caretModel.offset.coerceIn(0, document.textLength)
  val text = document.text

  return IdeContextPayload(
    activeFilePath = virtualFile?.path,
    languageId = virtualFile?.fileType?.name?.lowercase(),
    selectedText = editor.selectionModel.selectedText.orEmpty(),
    activeFileText = trimMiddle(text, 12_000),
    cursorPrefix = text.substring((caretOffset - 2_000).coerceAtLeast(0), caretOffset),
    cursorSuffix = text.substring(caretOffset, (caretOffset + 2_000).coerceAtMost(text.length)),
  )
}

private fun trimMiddle(value: String, maxChars: Int): String =
  if (value.length <= maxChars) {
    value
  } else {
    value.take(maxChars / 2) + "\n...[trimmed for context]...\n" + value.takeLast(maxChars / 2)
  }
