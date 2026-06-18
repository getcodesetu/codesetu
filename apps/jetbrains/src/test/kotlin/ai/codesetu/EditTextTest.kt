package ai.codesetu

import ai.codesetu.edit.buildEditUserMessage
import ai.codesetu.edit.stripCodeFences
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EditTextTest {
  @Test
  fun `strips a fenced block with a language tag`() {
    val reply = "```kotlin\nfun x() = 1\n```"
    assertEquals("fun x() = 1", stripCodeFences(reply))
  }

  @Test
  fun `strips a bare fenced block`() {
    assertEquals("a\nb", stripCodeFences("```\na\nb\n```"))
  }

  @Test
  fun `leaves unfenced text untouched`() {
    assertEquals("just code", stripCodeFences("  just code  "))
  }

  @Test
  fun `edit message carries instruction, language, and code`() {
    val msg = buildEditUserMessage("kt", "val a = 1", "make it a constant")
    assertTrue(msg.contains("Language: kt"))
    assertTrue(msg.contains("Instruction: make it a constant"))
    assertTrue(msg.contains("val a = 1"))
  }
}
