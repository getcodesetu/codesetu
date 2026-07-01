package ai.codesetu

import ai.codesetu.context.readPinnedFiles
import ai.codesetu.context.sanitizeFileQuery
import ai.codesetu.context.searchWorkspaceFiles
import java.io.File
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PinnedFilesTest {
  private fun tempRoot(): File = Files.createTempDirectory("codesetu-pins").toFile()

  @Test
  fun `sanitizes a query down to path characters`() {
    assertEquals("Main.kt", sanitizeFileQuery("Main.kt"))
    assertEquals("srcfoo", sanitizeFileQuery("src foo"))
    assertEquals("ab", sanitizeFileQuery("a\$%^b"))
  }

  @Test
  fun `finds matching files shortest path first and skips excluded dirs`() {
    val root = tempRoot()
    File(root, "src").mkdirs()
    File(root, "node_modules/pkg").mkdirs()
    File(root, "src/Main.kt").writeText("fun main() {}")
    File(root, "src/deep/MainHelper.kt").apply { parentFile.mkdirs(); writeText("x") }
    File(root, "node_modules/pkg/Main.kt").writeText("ignored")

    val results = searchWorkspaceFiles(root.path, "Main")

    assertTrue(results.contains("src/Main.kt"))
    assertTrue(results.contains("src/deep/MainHelper.kt"))
    assertTrue(results.none { it.startsWith("node_modules/") }, "excluded dirs must be skipped")
    assertEquals("src/Main.kt", results.first(), "shortest path should rank first")
  }

  @Test
  fun `reads pinned file contents and skips missing ones`() {
    val root = tempRoot()
    File(root, "a.kt").writeText("content A")

    val snippets = readPinnedFiles(root.path, listOf("a.kt", "missing.kt", "a.kt"))

    assertEquals(1, snippets.size) // missing skipped, duplicate de-duped
    assertEquals("a.kt", snippets[0].path)
    assertEquals("content A", snippets[0].text)
    assertEquals("kt", snippets[0].languageId)
  }

  @Test
  fun `offers matching folders with a trailing slash`() {
    val root = tempRoot()
    File(root, "src/auth").mkdirs()
    File(root, "src/auth/Login.kt").apply { parentFile.mkdirs(); writeText("x") }

    val results = searchWorkspaceFiles(root.path, "auth")

    assertTrue(results.contains("src/auth/"), "the folder itself should be offered")
    assertTrue(results.contains("src/auth/Login.kt"), "files under it should still match")
  }

  @Test
  fun `expands a pinned folder into its files and skips secrets`() {
    val root = tempRoot()
    File(root, "src/auth").mkdirs()
    File(root, "src/auth/Login.kt").apply { parentFile.mkdirs(); writeText("login") }
    File(root, "src/auth/Token.kt").writeText("token")
    File(root, "src/auth/server.pem").writeText("SECRET")
    File(root, "src/auth/node_modules/dep.kt").apply { parentFile.mkdirs(); writeText("dep") }

    val snippets = readPinnedFiles(root.path, listOf("src/auth/"))
    val paths = snippets.map { it.path }.toSet()

    assertTrue(paths.contains("src/auth/Login.kt"))
    assertTrue(paths.contains("src/auth/Token.kt"))
    assertTrue(paths.none { it.endsWith(".pem") }, "likely-secret files must be skipped")
    assertTrue(paths.none { it.contains("node_modules") }, "excluded dirs must be skipped")
  }

  @Test
  fun `folder expansion de-dupes against explicitly pinned files`() {
    val root = tempRoot()
    File(root, "src/auth").mkdirs()
    File(root, "src/auth/Login.kt").apply { parentFile.mkdirs(); writeText("login") }

    val snippets = readPinnedFiles(root.path, listOf("src/auth/Login.kt", "src/auth/"))

    assertEquals(1, snippets.count { it.path == "src/auth/Login.kt" }, "no duplicate snippet")
  }
}
