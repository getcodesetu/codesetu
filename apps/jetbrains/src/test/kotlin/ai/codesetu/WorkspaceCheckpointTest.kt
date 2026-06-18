package ai.codesetu

import ai.codesetu.agent.WorkspaceCheckpoint
import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WorkspaceCheckpointTest {
  private fun tempRoot(): File = Files.createTempDirectory("codesetu-checkpoint").toFile()

  @Test
  fun `restores a modified file to its pre-turn contents`() {
    val root = tempRoot()
    val file = File(root, "src/Main.kt").apply { parentFile.mkdirs(); writeText("original") }

    val checkpoint = WorkspaceCheckpoint(root.path)
    checkpoint.capture("src/Main.kt")
    file.writeText("agent rewrote this")

    val result = checkpoint.revert()

    assertEquals("original", file.readText())
    assertEquals(1, result.restored)
    assertEquals(0, result.deleted)
    assertEquals(0, result.failed)
  }

  @Test
  fun `deletes a file the agent created`() {
    val root = tempRoot()
    val checkpoint = WorkspaceCheckpoint(root.path)

    checkpoint.capture("new/Created.kt") // does not exist yet
    val created = File(root, "new/Created.kt").apply { parentFile.mkdirs(); writeText("brand new") }
    assertTrue(created.exists())

    val result = checkpoint.revert()

    assertFalse(created.exists())
    assertEquals(1, result.deleted)
    assertEquals(0, result.restored)
  }

  @Test
  fun `keeps only the first snapshot per file`() {
    val root = tempRoot()
    val file = File(root, "a.txt").apply { writeText("v0") }

    val checkpoint = WorkspaceCheckpoint(root.path)
    checkpoint.capture("a.txt")
    file.writeText("v1")
    checkpoint.capture("a.txt") // second capture must not overwrite the v0 snapshot
    file.writeText("v2")

    checkpoint.revert()

    assertEquals("v0", file.readText())
    assertEquals(listOf("a.txt"), checkpoint.changedFiles())
  }

  @Test
  fun `empty checkpoint reports empty`() {
    assertTrue(WorkspaceCheckpoint(tempRoot().path).isEmpty())
  }
}
