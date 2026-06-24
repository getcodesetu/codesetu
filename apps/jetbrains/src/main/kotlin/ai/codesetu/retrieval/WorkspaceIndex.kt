package ai.codesetu.retrieval

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.sqrt

/** A contiguous slice of one file, the unit that gets embedded and retrieved. */
data class CodeChunk(val path: String, val startLine: Int, val endLine: Int, val text: String)

/** A [CodeChunk] with its embedding and a stable id, stored in the index. */
@Serializable
data class IndexedChunk(
  val id: String,
  val path: String,
  @SerialName("start_line") val startLine: Int,
  @SerialName("end_line") val endLine: Int,
  val text: String,
  val vector: List<Double>,
)

/** A retrieval hit — a chunk plus its similarity to the query (higher is closer). */
data class RetrievedChunk(
  val path: String,
  val startLine: Int,
  val endLine: Int,
  val text: String,
  val score: Double,
)

/** One workspace file presented to the indexer. */
data class WorkspaceFile(val path: String, val text: String)

const val INDEX_FORMAT_VERSION = 1

/** The serializable form of a [WorkspaceIndex]. */
@Serializable
data class SerializedIndex(
  val version: Int = INDEX_FORMAT_VERSION,
  val model: String,
  // Per-file content hash, so an unchanged file is skipped on re-index.
  val files: Map<String, String> = emptyMap(),
  val chunks: List<IndexedChunk> = emptyList(),
)

/** Cosine similarity of two vectors; 0 if either has no magnitude. */
fun cosineSimilarity(a: List<Double>, b: List<Double>): Double {
  val n = minOf(a.size, b.size)
  var dot = 0.0
  var normA = 0.0
  var normB = 0.0
  for (i in 0 until n) {
    val x = a[i]
    val y = b[i]
    dot += x * y
    normA += x * x
    normB += y * y
  }
  if (normA == 0.0 || normB == 0.0) return 0.0
  return dot / (sqrt(normA) * sqrt(normB))
}

/**
 * In-memory vector store keyed by file, with content hashes for incremental
 * re-index and JSON (de)serialization for on-disk persistence. Search is a
 * brute-force cosine scan — fine for a single repo, dependency-free and
 * air-gapped-friendly. Kotlin mirror of the TypeScript `WorkspaceIndex`.
 */
class WorkspaceIndex(val model: String) {
  private val hashes = LinkedHashMap<String, String>()
  private val chunksByPath = LinkedHashMap<String, List<IndexedChunk>>()

  fun hasUnchanged(path: String, hash: String): Boolean = hashes[path] == hash

  fun upsertFile(path: String, hash: String, chunks: List<IndexedChunk>) {
    hashes[path] = hash
    chunksByPath[path] = chunks
  }

  fun removeFile(path: String) {
    hashes.remove(path)
    chunksByPath.remove(path)
  }

  fun paths(): List<String> = hashes.keys.toList()

  val chunkCount: Int
    get() = chunksByPath.values.sumOf { it.size }

  /** The [k] chunks most similar to [queryVector], highest score first. */
  fun search(queryVector: List<Double>, k: Int = 8): List<RetrievedChunk> {
    val scored = ArrayList<RetrievedChunk>()
    for (chunks in chunksByPath.values) {
      for (chunk in chunks) {
        scored.add(
          RetrievedChunk(
            chunk.path,
            chunk.startLine,
            chunk.endLine,
            chunk.text,
            cosineSimilarity(queryVector, chunk.vector),
          ),
        )
      }
    }
    scored.sortByDescending { it.score }
    return scored.take(maxOf(0, k))
  }

  fun serialize(): SerializedIndex {
    val chunks = ArrayList<IndexedChunk>()
    chunksByPath.values.forEach { chunks.addAll(it) }
    return SerializedIndex(INDEX_FORMAT_VERSION, model, LinkedHashMap(hashes), chunks)
  }

  companion object {
    /**
     * Rebuild from serialized form. Returns an empty index for [model] when the
     * data is absent, the wrong version, or a model mismatch — so a caller can
     * re-index rather than trust stale vectors.
     */
    fun deserialize(data: SerializedIndex?, model: String): WorkspaceIndex {
      val index = WorkspaceIndex(model)
      if (data == null || data.version != INDEX_FORMAT_VERSION || data.model != model) {
        return index
      }
      val byPath = HashMap<String, MutableList<IndexedChunk>>()
      for (chunk in data.chunks) {
        byPath.getOrPut(chunk.path) { ArrayList() }.add(chunk)
      }
      for ((path, hash) in data.files) {
        index.upsertFile(path, hash, byPath[path] ?: emptyList())
      }
      return index
    }
  }
}
