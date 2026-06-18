package ai.codesetu.completion

/** The fill-in-the-middle context around the caret: text before and after. */
data class FimContext(val prompt: String, val suffix: String)

/**
 * Build the fill-in-the-middle context around a caret offset, bounding the
 * prefix and suffix to a character budget so large files don't blow the request
 * size. Mirrors the VS Code `buildFimContext` helper so both IDEs frame the same
 * window for the model.
 */
fun buildFimContext(
  text: String,
  offset: Int,
  maxPrefixChars: Int,
  maxSuffixChars: Int,
): FimContext {
  val safeOffset = offset.coerceIn(0, text.length)
  val prefix = text.substring(0, safeOffset)
  val suffix = text.substring(safeOffset)
  return FimContext(
    prompt = prefix.takeLast(maxPrefixChars.coerceAtLeast(0)),
    suffix = suffix.take(maxSuffixChars.coerceAtLeast(0)),
  )
}
