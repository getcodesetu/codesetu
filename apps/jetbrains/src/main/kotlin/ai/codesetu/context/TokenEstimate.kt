package ai.codesetu.context

// Rough chars-per-token ratio for mixed English + code. A real tokenizer would
// be exact but heavy; this heuristic is plenty for a "how full is the context"
// gauge and stays dependency-free across every provider/model CodeSetu targets.
private const val CHARS_PER_TOKEN = 4

/** Approximate the token count of a single string. */
fun estimateTokens(text: String): Int =
  if (text.isEmpty()) 0 else (text.length + CHARS_PER_TOKEN - 1) / CHARS_PER_TOKEN

/** Approximate the combined token count of several text parts. */
fun estimateTokensForParts(parts: List<String>): Int =
  parts.sumOf { estimateTokens(it) }
