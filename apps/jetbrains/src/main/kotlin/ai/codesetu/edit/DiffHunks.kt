package ai.codesetu.edit

/**
 * One contiguous change between two texts: the removed lines and the lines that
 * replace them. A pure insertion has empty [oldLines]; a pure deletion has empty
 * [newLines]. [oldStart] is the 0-based line index in the original text where the
 * change begins, so a subset of hunks can be applied independently.
 *
 * Kotlin mirror of the TypeScript `DiffHunk` in `@codesetu/core` so both
 * platforms compute identical hunks for the `/edit` per-hunk review.
 */
data class DiffHunk(
  val oldStart: Int,
  val oldLines: List<String>,
  val newLines: List<String>,
)

private fun splitLines(text: String): List<String> = if (text.isEmpty()) emptyList() else text.split("\n")

/** `lcs[i][j]` = length of the longest common subsequence of `a[i:]` and `b[j:]`. */
private fun lcsTable(a: List<String>, b: List<String>): Array<IntArray> {
  val m = a.size
  val n = b.size
  val lcs = Array(m + 1) { IntArray(n + 1) }
  for (i in m - 1 downTo 0) {
    for (j in n - 1 downTo 0) {
      lcs[i][j] = if (a[i] == b[j]) lcs[i + 1][j + 1] + 1 else maxOf(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  return lcs
}

/**
 * Break the change from [oldText] to [newText] into independent hunks — maximal
 * runs of removed/added lines separated by unchanged context.
 */
fun computeHunks(oldText: String, newText: String): List<DiffHunk> {
  val a = splitLines(oldText)
  val b = splitLines(newText)
  val m = a.size
  val n = b.size
  val lcs = lcsTable(a, b)

  val hunks = ArrayList<DiffHunk>()
  var open = false
  var oldStart = 0
  var oldAcc = ArrayList<String>()
  var newAcc = ArrayList<String>()
  fun ensure(index: Int) {
    if (!open) {
      open = true
      oldStart = index
      oldAcc = ArrayList()
      newAcc = ArrayList()
    }
  }
  fun flush() {
    if (open) {
      hunks.add(DiffHunk(oldStart, oldAcc, newAcc))
      open = false
    }
  }

  var i = 0
  var j = 0
  while (i < m && j < n) {
    if (a[i] == b[j]) {
      flush()
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ensure(i)
      oldAcc.add(a[i])
      i++
    } else {
      ensure(i)
      newAcc.add(b[j])
      j++
    }
  }
  while (i < m) {
    ensure(i)
    oldAcc.add(a[i])
    i++
  }
  while (j < n) {
    ensure(i)
    newAcc.add(b[j])
    j++
  }
  flush()
  return hunks
}

/**
 * Reconstruct the text that results from accepting only the hunks whose indices
 * are in [accepted]. Rejected hunks keep their original lines, so accepting every
 * hunk reproduces the new text and accepting none reproduces the original.
 */
fun applyHunks(oldText: String, hunks: List<DiffHunk>, accepted: Set<Int>): String {
  val a = splitLines(oldText)
  val ordered = hunks.withIndex().sortedBy { it.value.oldStart }
  val out = ArrayList<String>()
  var cursor = 0
  for ((index, hunk) in ordered) {
    while (cursor < hunk.oldStart) {
      out.add(a[cursor])
      cursor++
    }
    if (accepted.contains(index)) out.addAll(hunk.newLines) else out.addAll(hunk.oldLines)
    cursor += hunk.oldLines.size
  }
  while (cursor < a.size) {
    out.add(a[cursor])
    cursor++
  }
  return out.joinToString("\n")
}
