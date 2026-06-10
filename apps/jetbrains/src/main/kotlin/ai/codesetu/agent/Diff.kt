package ai.codesetu.agent

const val MAX_DIFF_LINES = 80

/**
 * Line-oriented diff between two texts: each line is prefixed " " (unchanged),
 * "-" (removed), or "+" (added). Uses an LCS so it shows the minimal real
 * change, and caps output so a huge change can't flood an approval prompt.
 * Mirrors diffLines in @codesetu/core.
 */
fun diffLines(oldText: String, newText: String, maxLines: Int = MAX_DIFF_LINES): String {
  val a = if (oldText.isEmpty()) emptyList() else oldText.split("\n")
  val b = if (newText.isEmpty()) emptyList() else newText.split("\n")
  val m = a.size
  val n = b.size

  val lcs = Array(m + 1) { IntArray(n + 1) }
  for (i in m - 1 downTo 0) {
    for (j in n - 1 downTo 0) {
      lcs[i][j] = if (a[i] == b[j]) lcs[i + 1][j + 1] + 1 else maxOf(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  val out = ArrayList<String>()
  var i = 0
  var j = 0
  while (i < m && j < n) {
    when {
      a[i] == b[j] -> {
        out.add(" ${a[i]}")
        i++
        j++
      }
      lcs[i + 1][j] >= lcs[i][j + 1] -> {
        out.add("-${a[i]}")
        i++
      }
      else -> {
        out.add("+${b[j]}")
        j++
      }
    }
  }
  while (i < m) {
    out.add("-${a[i]}")
    i++
  }
  while (j < n) {
    out.add("+${b[j]}")
    j++
  }

  if (out.size <= maxLines) return out.joinToString("\n")
  val omitted = out.size - maxLines
  return out.take(maxLines).joinToString("\n") + "\n... ($omitted more diff lines)"
}
