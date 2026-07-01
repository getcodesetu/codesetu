package ai.codesetu.retrieval

const val DEFAULT_CHUNK_MAX_LINES = 60
const val DEFAULT_CHUNK_OVERLAP = 10
const val DEFAULT_EMBED_BATCH_SIZE = 64
const val DEFAULT_RETRIEVAL_K = 8

/**
 * Split a file into overlapping, line-aligned chunks. Line-based keeps it
 * language-agnostic; the overlap means a function straddling a boundary still
 * lands wholly inside some chunk. Whitespace-only input produces nothing.
 */
fun chunkFile(
  path: String,
  text: String,
  maxLines: Int = DEFAULT_CHUNK_MAX_LINES,
  overlap: Int = DEFAULT_CHUNK_OVERLAP,
): List<CodeChunk> {
  if (text.isBlank()) return emptyList()
  val max = maxOf(1, maxLines)
  val ov = maxOf(0, minOf(overlap, max - 1))
  val step = max - ov
  val lines = text.split("\n")
  val chunks = ArrayList<CodeChunk>()
  var start = 0
  while (start < lines.size) {
    val end = minOf(start + max, lines.size)
    val slice = lines.subList(start, end)
    if (slice.joinToString("").isNotBlank()) {
      chunks.add(CodeChunk(path, start + 1, end, slice.joinToString("\n")))
    }
    if (end >= lines.size) break
    start += step
  }
  return chunks
}

/**
 * Fast, stable, non-cryptographic content hash (FNV-1a, 32-bit) used only to
 * detect whether a file changed since it was last indexed.
 */
fun hashContent(text: String): String {
  var hash = 0x811c9dc5.toInt()
  for (ch in text) {
    hash = hash xor ch.code
    hash *= 0x01000193
  }
  return Integer.toHexString(hash)
}

data class IndexUpdateResult(val indexed: Int, val skipped: Int, val removed: Int)

/**
 * Bring [index] in line with [files]: skip unchanged files, (re)chunk and embed
 * changed/new ones (via [embed]), and drop files that have disappeared.
 * Embedding is batched and incremental, so re-index after editing one file is
 * cheap. Kotlin mirror of the TypeScript `updateWorkspaceIndex`.
 */
fun updateWorkspaceIndex(
  index: WorkspaceIndex,
  embed: (List<String>) -> List<List<Double>>,
  files: List<WorkspaceFile>,
  maxLines: Int = DEFAULT_CHUNK_MAX_LINES,
  overlap: Int = DEFAULT_CHUNK_OVERLAP,
  batchSize: Int = DEFAULT_EMBED_BATCH_SIZE,
  onProgress: ((Int, Int) -> Unit)? = null,
): IndexUpdateResult {
  val present = files.map { it.path }.toHashSet()
  var removed = 0
  for (path in index.paths()) {
    if (path !in present) {
      index.removeFile(path)
      removed += 1
    }
  }

  data class Pending(val path: String, val hash: String, val chunks: List<CodeChunk>)
  val pending = ArrayList<Pending>()
  var skipped = 0
  for (file in files) {
    val hash = hashContent(file.text)
    if (index.hasUnchanged(file.path, hash)) {
      skipped += 1
      continue
    }
    val chunks = chunkFile(file.path, file.text, maxLines, overlap)
    if (chunks.isEmpty()) {
      // Empty/whitespace file: record the hash so it's not re-chunked next run.
      index.upsertFile(file.path, hash, emptyList())
      continue
    }
    pending.add(Pending(file.path, hash, chunks))
  }

  val flat = pending.flatMap { it.chunks }
  val vectors = ArrayList<List<Double>>(flat.size)
  val effectiveBatch = maxOf(1, batchSize)
  var i = 0
  while (i < flat.size) {
    val batch = flat.subList(i, minOf(i + effectiveBatch, flat.size))
    vectors.addAll(embed(batch.map { it.text }))
    i += effectiveBatch
    onProgress?.invoke(minOf(i, flat.size), flat.size)
  }

  var cursor = 0
  var indexed = 0
  for (entry in pending) {
    val indexedChunks = entry.chunks.map { chunk ->
      IndexedChunk(
        id = "${chunk.path}:${chunk.startLine}-${chunk.endLine}",
        path = chunk.path,
        startLine = chunk.startLine,
        endLine = chunk.endLine,
        text = chunk.text,
        vector = vectors[cursor++],
      )
    }
    index.upsertFile(entry.path, entry.hash, indexedChunks)
    indexed += 1
  }

  return IndexUpdateResult(indexed, skipped, removed)
}

/**
 * Embed [query] and return the most semantically similar chunks. Returns nothing
 * for a blank query or an empty index — callers fall back to grep/glob.
 */
fun retrieveFromWorkspace(
  index: WorkspaceIndex,
  embed: (List<String>) -> List<List<Double>>,
  query: String,
  k: Int = DEFAULT_RETRIEVAL_K,
): List<RetrievedChunk> {
  if (query.isBlank() || index.chunkCount == 0) return emptyList()
  val queryVector = embed(listOf(query)).firstOrNull() ?: return emptyList()
  return index.search(queryVector, maxOf(1, k))
}

/** True when the user's message opts into workspace retrieval via `@workspace`. */
fun mentionsWorkspace(text: String): Boolean = Regex("(^|\\s)@workspace\\b", RegexOption.IGNORE_CASE).containsMatchIn(text)
