package ai.codesetu

import ai.codesetu.skills.BUILTIN_SKILLS
import ai.codesetu.skills.loadBuiltinSkills
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BuiltinSkillsLoaderTest {
  // Verifies the whole bundle path: build/resources/main/skills/<id>/SKILL.md
  // (copied from the repo root) is on the classpath and parses into skills whose
  // routing metadata matches the fallback constants. Bodies are the canonical
  // .md prose, so we only assert they're non-empty (not byte-equal).
  @Test
  fun loadsBundledSkillsMatchingFallbackRoutingMetadata() {
    val loaded = loadBuiltinSkills()

    assertEquals(BUILTIN_SKILLS.map { it.id }.toSet(), loaded.map { it.id }.toSet())

    for (fallback in BUILTIN_SKILLS) {
      val skill = loaded.first { it.id == fallback.id }
      assertEquals(fallback.slashCommands, skill.slashCommands, "slashCommands for ${fallback.id}")
      assertEquals(fallback.keywords, skill.keywords, "keywords for ${fallback.id}")
      assertTrue(skill.instruction.body.isNotEmpty(), "body for ${fallback.id}")
    }
  }
}
