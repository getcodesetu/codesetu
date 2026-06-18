package ai.codesetu.context

import ai.codesetu.model.WorkspaceSnippet
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes

// Never walk into build output / VCS / likely-secret directories when offering
// or reading @-mentioned files, mirroring the VS Code exclude set.
private val EXCLUDED_DIRS =
  setOf("node_modules", "dist", "build", "out", "target", ".git", ".idea", ".gradle", "secrets", ".aws")

// Cap each pinned file so a few large files can't blow out the context window.
private const val MAX_PINNED_FILE_CHARS = 12_000

/** Strip characters that aren't part of a path so a query can't do anything odd. */
fun sanitizeFileQuery(query: String): String = query.filter { it.isLetterOrDigit() || it in "_-./" }

/**
 * Find workspace files whose relative path contains the (sanitized) query, for
 * the chat composer's @-mention picker. Returns workspace-relative paths,
 * shortest first so the closest matches surface at the top.
 */
fun searchWorkspaceFiles(root: String?, query: String, limit: Int = 20): List<String> {
  if (root == null) return emptyList()
  val base = File(root).canonicalFile.toPath()
  if (!Files.isDirectory(base)) return emptyList()
  val needle = sanitizeFileQuery(query).lowercase()
  val results = ArrayList<String>()

  Files.walkFileTree(
    base,
    object : SimpleFileVisitor<Path>() {
      override fun preVisitDirectory(dir: Path, attrs: BasicFileAttributes): FileVisitResult {
        val name = dir.fileName?.toString()
        return if (dir != base && name != null && name in EXCLUDED_DIRS) {
          FileVisitResult.SKIP_SUBTREE
        } else {
          FileVisitResult.CONTINUE
        }
      }

      override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
        if (results.size >= limit * 4) return FileVisitResult.TERMINATE
        val rel = base.relativize(file).toString().replace(File.separatorChar, '/')
        if (needle.isEmpty() || rel.lowercase().contains(needle)) results.add(rel)
        return FileVisitResult.CONTINUE
      }

      override fun visitFileFailed(file: Path, exc: java.io.IOException): FileVisitResult =
        FileVisitResult.CONTINUE
    },
  )

  return results.sortedWith(compareBy({ it.length }, { it })).take(limit)
}

/**
 * Read the user's pinned files into snippets for the model context. Silently
 * skips anything that can't be read (deleted, binary, excluded) so one bad pin
 * doesn't fail the whole turn.
 */
fun readPinnedFiles(root: String?, paths: List<String>): List<WorkspaceSnippet> {
  if (root == null || paths.isEmpty()) return emptyList()
  val base = File(root)
  val seen = HashSet<String>()
  val snippets = ArrayList<WorkspaceSnippet>()
  for (path in paths) {
    if (!seen.add(path)) continue
    val file = File(path).let { if (it.isAbsolute) it else File(base, path) }
    try {
      if (!file.isFile) continue
      val text = String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
        .take(MAX_PINNED_FILE_CHARS)
      snippets.add(WorkspaceSnippet(path = path, languageId = file.extension.ifEmpty { null }, text = text))
    } catch (error: Exception) {
      // Unreadable pin — skip it rather than failing the turn.
    }
  }
  return snippets
}
