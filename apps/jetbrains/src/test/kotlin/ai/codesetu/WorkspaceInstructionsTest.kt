package ai.codesetu

import ai.codesetu.instructions.WorkspaceInstructionSource
import ai.codesetu.instructions.parseWorkspaceInstructions
import kotlin.test.Test
import kotlin.test.assertEquals

class WorkspaceInstructionsTest {
  @Test
  fun parsesSkillsChecksAndWarnings() {
    val result = parseWorkspaceInstructions(
      listOf(
        WorkspaceInstructionSource(
          kind = "skill",
          path = ".codesetu/skills/spring.md",
          content = "---\nid: spring-reviewer\nname: Spring Reviewer\ndescription: Review Spring code.\n---\nUse Spring guidance.",
        ),
        WorkspaceInstructionSource(
          kind = "check",
          path = ".codesetu/checks/security.md",
          content = "---\nid: security-review\nname: Security Review\ndescription: Check auth.\n---\nReturn findings.",
        ),
        WorkspaceInstructionSource(
          kind = "skill",
          path = ".codesetu/skills/broken.md",
          content = "missing frontmatter",
        ),
      ),
    )

    assertEquals(1, result.skills.size)
    assertEquals(1, result.checks.size)
    assertEquals(listOf(".codesetu/skills/broken.md: missing YAML frontmatter"), result.warnings)
  }
}
