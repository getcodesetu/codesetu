package ai.codesetu

import ai.codesetu.edit.applyHunks
import ai.codesetu.edit.computeHunks
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DiffHunksTest {
  private val old = listOf("one", "two", "three", "four", "five").joinToString("\n")
  private val new = listOf("one", "TWO", "three", "four", "FIVE", "six").joinToString("\n")

  @Test
  fun `splits non-adjacent changes into separate hunks`() {
    val hunks = computeHunks(old, new)
    assertEquals(2, hunks.size)
    assertEquals(listOf("two"), hunks[0].oldLines)
    assertEquals(listOf("TWO"), hunks[0].newLines)
    assertEquals(listOf("five"), hunks[1].oldLines)
    assertEquals(listOf("FIVE", "six"), hunks[1].newLines)
  }

  @Test
  fun `models pure insertion and deletion`() {
    val ins = computeHunks("a\nb", "a\nINSERTED\nb")
    assertEquals(1, ins.size)
    assertTrue(ins[0].oldLines.isEmpty())
    assertEquals(listOf("INSERTED"), ins[0].newLines)

    val del = computeHunks("a\ngone\nb", "a\nb")
    assertEquals(1, del.size)
    assertEquals(listOf("gone"), del[0].oldLines)
    assertTrue(del[0].newLines.isEmpty())
  }

  @Test
  fun `accepting all or none round-trips`() {
    val hunks = computeHunks(old, new)
    assertEquals(new, applyHunks(old, hunks, hunks.indices.toSet()))
    assertEquals(old, applyHunks(old, hunks, emptySet()))
  }

  @Test
  fun `applies only the selected hunk`() {
    val hunks = computeHunks(old, new)
    val result = applyHunks(old, hunks, setOf(1))
    assertEquals(listOf("one", "two", "three", "four", "FIVE", "six").joinToString("\n"), result)
  }
}
