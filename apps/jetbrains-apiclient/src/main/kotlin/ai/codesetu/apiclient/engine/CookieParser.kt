package ai.codesetu.apiclient.engine

import ai.codesetu.apiclient.model.ResponseCookie

/** Kotlin mirror of packages/api-client-core/src/engine/cookies.ts. */
object CookieParser {
  fun parse(header: String): ResponseCookie? {
    val segments = header.split(";")
    val first = segments.firstOrNull() ?: return null
    val eq = first.indexOf("=")
    if (eq == -1) return null

    var domain: String? = null
    var path: String? = null
    var expires: String? = null
    var maxAge: Long? = null
    var sameSite: String? = null
    var httpOnly = false
    var secure = false

    for (segment in segments.drop(1)) {
      val attrEq = segment.indexOf("=")
      val attr = (if (attrEq == -1) segment else segment.substring(0, attrEq)).trim().lowercase()
      val attrValue = if (attrEq == -1) "" else segment.substring(attrEq + 1).trim()
      when (attr) {
        "domain" -> domain = attrValue
        "path" -> path = attrValue
        "expires" -> expires = attrValue
        "max-age" -> maxAge = attrValue.toLongOrNull()
        "samesite" -> sameSite = attrValue
        "httponly" -> httpOnly = true
        "secure" -> secure = true
      }
    }

    return ResponseCookie(
      name = first.substring(0, eq).trim(),
      value = first.substring(eq + 1).trim(),
      domain = domain,
      path = path,
      expires = expires,
      maxAge = maxAge,
      httpOnly = httpOnly,
      secure = secure,
      sameSite = sameSite,
    )
  }

  fun parseAll(headers: List<String>): List<ResponseCookie> = headers.mapNotNull { parse(it) }
}
