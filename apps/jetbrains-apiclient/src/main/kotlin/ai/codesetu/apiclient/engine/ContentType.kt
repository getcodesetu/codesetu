package ai.codesetu.apiclient.engine

/** Kotlin mirror of packages/api-client-core/src/engine/contentType.ts. */
object ContentType {
  private val textualTypes = setOf(
    "application/json",
    "application/ld+json",
    "application/xml",
    "application/xhtml+xml",
    "application/javascript",
    "application/ecmascript",
    "application/x-www-form-urlencoded",
    "application/graphql",
    "image/svg+xml",
  )

  fun isTextual(contentType: String?): Boolean {
    if (contentType == null) return true
    val mime = mimeOf(contentType)
    return mime.startsWith("text/") ||
      mime.endsWith("+json") ||
      mime.endsWith("+xml") ||
      textualTypes.contains(mime)
  }

  fun mimeOf(contentType: String?): String =
    contentType?.substringBefore(";")?.trim()?.lowercase().orEmpty()
}
