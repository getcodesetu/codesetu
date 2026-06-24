package ai.codesetu

import ai.codesetu.retrieval.WorkspaceFile
import ai.codesetu.retrieval.WorkspaceIndex
import ai.codesetu.retrieval.chunkFile
import ai.codesetu.retrieval.cosineSimilarity
import ai.codesetu.retrieval.hashContent
import ai.codesetu.retrieval.mentionsWorkspace
import ai.codesetu.retrieval.retrieveFromWorkspace
import ai.codesetu.retrieval.updateWorkspaceIndex
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class WorkspaceIndexTest {
  // Deterministic bag-of-words embedder over a fixed vocabulary, so overlapping
  // texts score higher without a network call. Counts embedded texts to prove
  // incremental re-index skips work.
  private val vocab = listOf("auth", "token", "login", "payment", "charge", "refund", "render", "pixel")
  private var embedded = 0

  private fun embed(texts: List<String>): List<List<Double>> {
    embedded += texts.size
    return texts.map { text ->
      val lower = text.lowercase()
      vocab.map { word -> (lower.split(word).size - 1).toDouble() }
    }
  }

  private val files = listOf(
    WorkspaceFile("src/auth.kt", "fun login() {}\nvalidate auth token here\n"),
    WorkspaceFile("src/payments.kt", "fun charge() {}\nissue a refund payment\n"),
    WorkspaceFile("src/ui.kt", "fun render() {}\ndraw every pixel\n"),
  )

  @Test
  fun `chunkFile splits into overlapping line-aligned chunks`() {
    val text = (1..25).joinToString("\n") { "line $it" }
    val chunks = chunkFile("a.kt", text, maxLines = 10, overlap = 2)
    assertEquals(1, chunks[0].startLine)
    assertEquals(10, chunks[0].endLine)
    assertEquals(9, chunks[1].startLine) // step = 10 - 2 = 8 → next starts at line 9
    assertEquals(25, chunks.last().endLine)
  }

  @Test
  fun `chunkFile ignores whitespace-only files`() {
    assertTrue(chunkFile("blank.kt", "  \n\n  ").isEmpty())
  }

  @Test
  fun `cosineSimilarity is 1 for parallel and 0 for a zero vector`() {
    assertEquals(1.0, cosineSimilarity(listOf(1.0, 2.0, 3.0), listOf(2.0, 4.0, 6.0)), 1e-9)
    assertEquals(0.0, cosineSimilarity(listOf(0.0, 0.0), listOf(1.0, 1.0)))
  }

  @Test
  fun `updateWorkspaceIndex indexes all then skips unchanged`() {
    val index = WorkspaceIndex("fake-model")
    val first = updateWorkspaceIndex(index, ::embed, files)
    assertEquals(3, first.indexed)
    assertEquals(0, first.skipped)
    assertTrue(index.chunkCount > 0)

    val second = updateWorkspaceIndex(index, ::embed, files)
    assertEquals(0, second.indexed)
    assertEquals(3, second.skipped)
  }

  @Test
  fun `updateWorkspaceIndex re-embeds only changed file and drops deleted`() {
    val index = WorkspaceIndex("fake-model")
    updateWorkspaceIndex(index, ::embed, files)
    val afterFirst = embedded

    val changed = listOf(
      WorkspaceFile("src/auth.kt", "fun login() {}\nrefresh the auth token now\n"),
      files[1],
      // src/ui.kt removed
    )
    val result = updateWorkspaceIndex(index, ::embed, changed)
    assertEquals(1, result.indexed)
    assertEquals(1, result.skipped)
    assertEquals(1, result.removed)
    assertTrue(!index.paths().contains("src/ui.kt"))
    assertTrue(embedded - afterFirst < afterFirst, "only the changed file should re-embed")
  }

  @Test
  fun `retrieveFromWorkspace ranks the closest file first`() {
    val index = WorkspaceIndex("fake-model")
    updateWorkspaceIndex(index, ::embed, files)
    val hits = retrieveFromWorkspace(index, ::embed, "how do we validate the auth token", k = 3)
    assertEquals("src/auth.kt", hits.first().path)
  }

  @Test
  fun `retrieveFromWorkspace returns nothing for blank query or empty index`() {
    val empty = WorkspaceIndex("fake-model")
    assertTrue(retrieveFromWorkspace(empty, ::embed, "anything").isEmpty())

    val index = WorkspaceIndex("fake-model")
    updateWorkspaceIndex(index, ::embed, files)
    assertTrue(retrieveFromWorkspace(index, ::embed, "   ").isEmpty())
  }

  @Test
  fun `index round-trips through serialize and deserialize`() {
    val index = WorkspaceIndex("fake-model")
    updateWorkspaceIndex(index, ::embed, files)
    val restored = WorkspaceIndex.deserialize(index.serialize(), "fake-model")
    assertEquals(index.chunkCount, restored.chunkCount)
    assertEquals(index.paths().sorted(), restored.paths().sorted())
    val hits = retrieveFromWorkspace(restored, ::embed, "issue a refund", k = 1)
    assertEquals("src/payments.kt", hits.first().path)
  }

  @Test
  fun `deserialize discards an index from a different model`() {
    val index = WorkspaceIndex("model-a")
    val restored = WorkspaceIndex.deserialize(index.serialize(), "model-b")
    assertEquals(0, restored.chunkCount)
  }

  @Test
  fun `hashContent is stable and content-sensitive`() {
    assertEquals(hashContent("abc"), hashContent("abc"))
    assertTrue(hashContent("abc") != hashContent("abd"))
  }

  @Test
  fun `mentionsWorkspace detects the tag and ignores look-alikes`() {
    assertTrue(mentionsWorkspace("@workspace where is auth"))
    assertTrue(mentionsWorkspace("explain @workspace token flow"))
    assertTrue(!mentionsWorkspace("workspace settings"))
    assertTrue(!mentionsWorkspace("foo@workspaces.io"))
  }
}
