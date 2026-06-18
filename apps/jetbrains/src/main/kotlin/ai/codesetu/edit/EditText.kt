package ai.codesetu.edit

/** System prompt for the one-shot "rewrite this code" edit flow. */
const val EDIT_SYSTEM_PROMPT: String =
  "You are CodeSetu, a precise code-editing assistant. Rewrite the user's code so " +
    "it satisfies their instruction. Return ONLY the revised code — no explanation, " +
    "no commentary, and no Markdown code fences. Preserve the surrounding style, " +
    "indentation, and language."

/**
 * Strip a single wrapping Markdown code fence from a model reply, if present, so
 * the edited code can be applied verbatim. Leaves unfenced text untouched.
 */
fun stripCodeFences(text: String): String {
  val trimmed = text.trim()
  if (!trimmed.startsWith("```")) return trimmed
  val lines = trimmed.lines().toMutableList()
  lines.removeAt(0) // opening ``` or ```lang
  if (lines.isNotEmpty() && lines.last().trim() == "```") {
    lines.removeAt(lines.size - 1)
  }
  return lines.joinToString("\n")
}

/** Build the user message asking the model to rewrite `code` per `instruction`. */
fun buildEditUserMessage(languageId: String?, code: String, instruction: String): String =
  buildString {
    if (!languageId.isNullOrBlank()) append("Language: ").append(languageId).append('\n')
    append("Instruction: ").append(instruction).append("\n\nCode:\n")
    append("```").append(languageId.orEmpty()).append('\n')
    append(code)
    append("\n```")
  }
