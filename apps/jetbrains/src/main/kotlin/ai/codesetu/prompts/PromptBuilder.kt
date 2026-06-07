package ai.codesetu.prompts

import ai.codesetu.model.IdeActionId
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.model.WorkspaceInstruction

fun buildSystemMessage(
  instructions: List<WorkspaceInstruction>,
  pinnedSkills: List<WorkspaceInstruction> = emptyList(),
): String {
  val parts = mutableListOf(
    "You are CodeSetu, an AI coding assistant for Indian developers. Be concise, correct, practical, and privacy-aware.",
    "Use the supplied IDE context as the source of truth. Ask for missing context when needed.",
  )

  if (instructions.isNotEmpty()) {
    parts.add(formatWorkspaceInstructions(instructions))
  }

  if (pinnedSkills.isNotEmpty()) {
    parts.add(formatPinnedSkills(pinnedSkills))
  }

  return parts.joinToString("\n\n")
}

private fun formatWorkspaceInstructions(instructions: List<WorkspaceInstruction>): String {
  val rendered = instructions.joinToString("\n\n") { instruction ->
    listOf("${instruction.name} (${instruction.id})", instruction.description, instruction.body)
      .joinToString("\n")
  }
  return "Workspace instructions\n\n$rendered"
}

private fun formatPinnedSkills(skills: List<WorkspaceInstruction>): String {
  val rendered = skills.joinToString("\n\n") { skill ->
    listOf("Skill: ${skill.name} (${skill.id})", skill.description, skill.body).joinToString("\n")
  }
  return "Active skills\n\n$rendered"
}

fun buildActionInstruction(actionId: IdeActionId): String =
  when (actionId) {
    IdeActionId.EXPLAIN -> "Explain the selected code clearly and concisely. Include key control flow, inputs, outputs, and risks."
    IdeActionId.REFACTOR -> "Suggest a focused refactor for the selected code. Preserve behavior and explain the trade-offs."
    IdeActionId.WRITE_TESTS -> "Write focused tests for the selected code. Prefer examples that cover normal behavior and edge cases."
    IdeActionId.FIX_BUG -> "Identify the likely bug in the selected code and propose the smallest safe fix."
    IdeActionId.ADD_DOCS -> "Add useful documentation for the selected code. Keep it accurate and close to the code."
  }

fun buildActionUserMessage(
  actionId: IdeActionId,
  context: IdeContextPayload,
  instructions: List<WorkspaceInstruction>,
): String {
  val actionInstruction = buildActionInstruction(actionId)

  val instructionBlock = instructions.joinToString("\n\n") { "### ${it.name}\n${it.body}" }
  return listOf(
    actionInstruction,
    if (instructionBlock.isBlank()) "" else "Workspace guidance:\n\n$instructionBlock",
    "Use this IDE context:",
    buildContextMarkdown(context),
  ).filter { it.isNotBlank() }.joinToString("\n\n")
}

fun buildContextMarkdown(context: IdeContextPayload): String {
  val sections = mutableListOf<String>()

  context.activeFilePath?.let { sections.add("Active file: $it") }
  context.languageId?.let { sections.add("Language: $it") }
  context.selectedText?.takeIf { it.isNotBlank() }?.let {
    sections.add(fenced("Selected code from ${context.activeFilePath ?: "active file"}", context.languageId, it))
  }
  context.activeFileText?.takeIf { it.isNotBlank() }?.let {
    sections.add(fenced("Active file excerpt", context.languageId, trimMiddle(it, 12_000)))
  }

  return sections.joinToString("\n\n")
}

private fun fenced(label: String, languageId: String?, value: String): String =
  "### $label\n\n```${languageId.orEmpty()}\n$value\n```"

private fun trimMiddle(value: String, maxChars: Int): String =
  if (value.length <= maxChars) {
    value
  } else {
    value.take(maxChars / 2) + "\n...[trimmed for context]...\n" + value.takeLast(maxChars / 2)
  }
