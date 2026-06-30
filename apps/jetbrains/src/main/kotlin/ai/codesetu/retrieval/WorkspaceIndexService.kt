package ai.codesetu.retrieval

import ai.codesetu.agent.AgentTool
import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.settings.CodeSetuSettingsState
import ai.codesetu.settings.resolveEmbeddingModel
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

// Never index build output / VCS / likely-secret directories.
private val EXCLUDED_DIRS =
  setOf("node_modules", "dist", "build", "out", "target", ".git", ".idea", ".gradle", "secrets", ".aws")

// Skip very large files (generated bundles, data) that would bloat the index.
private const val MAX_FILE_BYTES = 200_000L

/**
 * Owns the @workspace semantic index for one project: builds and persists it,
 * retrieves chunks for a chat turn, and exposes the agent's `search_workspace`
 * tool. Embeddings run against any OpenAI-compatible endpoint. Mirrors the VS
 * Code `WorkspaceIndexManager`.
 */
@Service(Service.Level.PROJECT)
class WorkspaceIndexService(private val project: Project) {
  private val client = CodeSetuProviderClient()
  private val json = Json { ignoreUnknownKeys = true }
  private var index: WorkspaceIndex? = null

  private fun embeddingModel(): String =
    resolveEmbeddingModel(CodeSetuSettingsState.getInstance().state.embeddingModel)

  private fun embed(texts: List<String>): List<List<Double>> = client.embed(texts)

  private fun indexFile(): File = File("${project.basePath}/.codesetu/workspace-index.json")

  @Synchronized
  private fun load(): WorkspaceIndex {
    val model = embeddingModel()
    val existing = index
    if (existing != null && existing.model == model) return existing
    val file = indexFile()
    val loaded =
      if (file.isFile) {
        try {
          WorkspaceIndex.deserialize(json.decodeFromString<SerializedIndex>(file.readText()), model)
        } catch (error: Exception) {
          WorkspaceIndex(model)
        }
      } else {
        WorkspaceIndex(model)
      }
    index = loaded
    return loaded
  }

  @Synchronized
  private fun save(idx: WorkspaceIndex) {
    val dir = File("${project.basePath}/.codesetu")
    dir.mkdirs()
    indexFile().writeText(json.encodeToString(idx.serialize()))
  }

  /** (Re)build the index incrementally, reporting progress. Returns a summary. */
  fun reindex(onProgress: ((Int, Int) -> Unit)? = null): String {
    val base = project.basePath ?: return "No project folder is open."
    val idx = load()
    val files = collectFiles(base)
    if (files.isEmpty()) return "No indexable files found in the workspace."
    val result = updateWorkspaceIndex(idx, ::embed, files, onProgress = onProgress)
    save(idx)
    return "Indexed ${result.indexed} file(s), skipped ${result.skipped} unchanged, " +
      "removed ${result.removed}. ${idx.chunkCount} chunks total."
  }

  /** True once an index with at least one chunk is available (loads from disk if needed). */
  @Synchronized
  fun isIndexed(): Boolean = load().chunkCount > 0

  /** Retrieve chunks for a chat turn (empty on error or empty index). */
  fun retrieve(query: String, k: Int): List<RetrievedChunk> {
    val idx = load()
    if (idx.chunkCount == 0) return emptyList()
    return try {
      retrieveFromWorkspace(idx, ::embed, query, k)
    } catch (error: Exception) {
      emptyList()
    }
  }

  /** The agent's semantic-search tool, or null when no index is built yet. */
  fun searchToolOrNull(): AgentTool? {
    val idx = load()
    if (idx.chunkCount == 0) return null
    val k = CodeSetuSettingsState.getInstance().state.workspaceRetrievalK
    return SearchWorkspaceTool({ query, count -> retrieve(query, count) }, defaultK = k)
  }

  private fun collectFiles(base: String): List<WorkspaceFile> {
    val root = File(base).canonicalFile
    val rootPath = root.toPath()
    val maxFiles = CodeSetuSettingsState.getInstance().state.workspaceIndexMaxFiles
    val files = ArrayList<WorkspaceFile>()

    Files.walkFileTree(
      rootPath,
      object : SimpleFileVisitor<Path>() {
        override fun preVisitDirectory(dir: Path, attrs: BasicFileAttributes): FileVisitResult {
          val name = dir.fileName?.toString()
          return if (dir != rootPath && name != null && name in EXCLUDED_DIRS) {
            FileVisitResult.SKIP_SUBTREE
          } else {
            FileVisitResult.CONTINUE
          }
        }

        override fun visitFile(file: Path, attrs: BasicFileAttributes): FileVisitResult {
          if (files.size >= maxFiles) return FileVisitResult.TERMINATE
          val name = file.fileName?.toString() ?: return FileVisitResult.CONTINUE
          if (isLikelySecret(name) || attrs.size() > MAX_FILE_BYTES) return FileVisitResult.CONTINUE
          try {
            val text = String(Files.readAllBytes(file), StandardCharsets.UTF_8)
            // Skip files that look binary (a NUL byte in the first chunk).
            if (text.take(4096).contains('\u0000')) return FileVisitResult.CONTINUE
            val rel = rootPath.relativize(file).toString().replace(File.separatorChar, '/')
            files.add(WorkspaceFile(rel, text))
          } catch (error: Exception) {
            // Unreadable file — skip it.
          }
          return FileVisitResult.CONTINUE
        }

        override fun visitFileFailed(file: Path, exc: java.io.IOException): FileVisitResult =
          FileVisitResult.CONTINUE
      },
    )
    return files
  }

  private fun isLikelySecret(name: String): Boolean {
    val n = name.lowercase()
    return n.startsWith(".env") ||
      n.startsWith("id_rsa") ||
      n.endsWith(".pem") ||
      n.endsWith(".key") ||
      n.endsWith(".pfx") ||
      n.endsWith(".p12") ||
      n.endsWith(".lock") ||
      n.contains(".min.")
  }

  companion object {
    fun getInstance(project: Project): WorkspaceIndexService =
      project.getService(WorkspaceIndexService::class.java)
  }
}
