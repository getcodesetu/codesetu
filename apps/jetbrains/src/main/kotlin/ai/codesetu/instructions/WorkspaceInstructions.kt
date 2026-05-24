package ai.codesetu.instructions

import ai.codesetu.model.WorkspaceInstruction

data class WorkspaceInstructionSource(
  val kind: String,
  val path: String,
  val content: String,
)

data class WorkspaceInstructionParseResult(
  val skills: List<WorkspaceInstruction>,
  val checks: List<WorkspaceInstruction>,
  val warnings: List<String>,
)

fun parseWorkspaceInstructions(
  sources: List<WorkspaceInstructionSource>,
): WorkspaceInstructionParseResult {
  val skills = mutableListOf<WorkspaceInstruction>()
  val checks = mutableListOf<WorkspaceInstruction>()
  val warnings = mutableListOf<String>()
  val seenIds = mutableSetOf<String>()

  for (source in sources) {
    val parsed = parseOne(source)
    val warning = parsed.warning

    if (warning != null) {
      warnings.add(warning)
      continue
    }

    val instruction = parsed.instruction ?: continue
    if (!seenIds.add(instruction.id)) {
      warnings.add("${source.path}: duplicate instruction id \"${instruction.id}\"")
      continue
    }

    if (source.kind == "skill") {
      skills.add(instruction)
    } else {
      checks.add(instruction)
    }
  }

  return WorkspaceInstructionParseResult(skills, checks, warnings)
}

private data class ParsedInstruction(
  val instruction: WorkspaceInstruction? = null,
  val warning: String? = null,
)

private fun parseOne(source: WorkspaceInstructionSource): ParsedInstruction {
  val regex = Regex("^---\\n([\\s\\S]*?)\\n---\\n?([\\s\\S]*)$")
  val match = regex.find(source.content)
    ?: return ParsedInstruction(warning = "${source.path}: missing YAML frontmatter")

  val metadata = parseSimpleYaml(match.groupValues[1])
  val id = metadata["id"]?.trim().orEmpty()
  val name = metadata["name"]?.trim().orEmpty()
  val description = metadata["description"]?.trim().orEmpty()
  val body = match.groupValues[2].trim()

  if (id.isEmpty() || name.isEmpty() || description.isEmpty()) {
    return ParsedInstruction(warning = "${source.path}: id, name, and description are required")
  }

  if (body.isEmpty()) {
    return ParsedInstruction(warning = "${source.path}: instruction body is required")
  }

  return ParsedInstruction(
    instruction = WorkspaceInstruction(
      id = id,
      name = name,
      description = description,
      sourcePath = source.path,
      body = body,
    ),
  )
}

private fun parseSimpleYaml(yaml: String): Map<String, String> =
  yaml.lines()
    .mapNotNull { line ->
      val separator = line.indexOf(":")
      if (separator == -1) {
        null
      } else {
        line.take(separator).trim() to line.drop(separator + 1).trim().trim('"', '\'')
      }
    }
    .toMap()
