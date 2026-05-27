package ai.codesetu.apiclient.importer

import ai.codesetu.apiclient.model.ApiKeyLocation
import ai.codesetu.apiclient.model.Auth
import ai.codesetu.apiclient.model.AuthType
import ai.codesetu.apiclient.model.BasicAuth
import ai.codesetu.apiclient.model.BodyMode
import ai.codesetu.apiclient.model.FormDataField
import ai.codesetu.apiclient.model.FormFieldKind
import ai.codesetu.apiclient.model.HttpRequest
import ai.codesetu.apiclient.model.KeyValue
import ai.codesetu.apiclient.model.ModelFactory
import ai.codesetu.apiclient.model.RawLanguage
import ai.codesetu.apiclient.model.RequestBody
import ai.codesetu.apiclient.model.RequestNode
import ai.codesetu.apiclient.model.RequestProtocol
import java.net.URI
import java.net.URLDecoder

/** Kotlin mirror of packages/api-client-core/src/import/curl.ts. */
object CurlParser {
  fun parse(command: String): RequestNode {
    val tokens = tokenize(command)
    val headers = mutableListOf<KeyValue>()
    val dataParts = mutableListOf<String>()
    val formData = mutableListOf<FormDataField>()
    var method: String? = null
    var auth = Auth()
    var url = ""
    var urlencoded = false
    var isForm = false

    var index = 0
    if (tokens.getOrNull(index)?.lowercase() == "curl") index += 1

    while (index < tokens.size) {
      when (val token = tokens[index]) {
        "-X", "--request" -> method = tokens.getOrNull(++index)
        "-H", "--header" -> {
          val header = tokens.getOrNull(++index) ?: ""
          val colon = header.indexOf(":")
          if (colon != -1) {
            headers += KeyValue(header.substring(0, colon).trim(), header.substring(colon + 1).trim(), true)
          }
        }
        "-d", "--data", "--data-raw", "--data-binary", "--data-ascii" ->
          dataParts += tokens.getOrNull(++index) ?: ""
        "--data-urlencode" -> {
          urlencoded = true
          dataParts += tokens.getOrNull(++index) ?: ""
        }
        "-u", "--user" -> {
          val credentials = tokens.getOrNull(++index) ?: ""
          val colon = credentials.indexOf(":")
          auth = Auth(
            type = AuthType.BASIC,
            basic = BasicAuth(
              username = if (colon == -1) credentials else credentials.substring(0, colon),
              password = if (colon == -1) "" else credentials.substring(colon + 1),
            ),
          )
        }
        "-F", "--form" -> {
          val field = tokens.getOrNull(++index) ?: ""
          val eq = field.indexOf("=")
          if (eq != -1) {
            isForm = true
            val value = field.substring(eq + 1)
            formData += if (value.startsWith("@")) {
              FormDataField(key = field.substring(0, eq), kind = FormFieldKind.FILE, filePath = value.substring(1))
            } else {
              FormDataField(key = field.substring(0, eq), kind = FormFieldKind.TEXT, value = value)
            }
          }
        }
        "--url" -> url = tokens.getOrNull(++index) ?: ""
        "-b", "--cookie" -> headers += KeyValue("Cookie", tokens.getOrNull(++index) ?: "", true)
        "--compressed", "-L", "--location", "-s", "--silent", "-k", "--insecure", "-i", "--include" -> Unit
        else -> if (!token.startsWith("-") && url.isEmpty()) url = token
      }
      index += 1
    }

    val body = when {
      isForm -> RequestBody(mode = BodyMode.FORM_DATA, formData = formData)
      dataParts.isNotEmpty() -> {
        val joined = dataParts.joinToString("&")
        if (urlencoded || hasFormContentType(headers)) {
          RequestBody(mode = BodyMode.URLENCODED, urlencoded = parseUrlencoded(joined))
        } else {
          RequestBody(
            mode = BodyMode.RAW,
            raw = joined,
            rawLanguage = if (looksJson(joined)) RawLanguage.JSON else RawLanguage.TEXT,
          )
        }
      }
      else -> RequestBody(mode = BodyMode.NONE)
    }

    val resolvedMethod = method ?: if (dataParts.isNotEmpty() || isForm) "POST" else "GET"

    val request = HttpRequest(
      method = resolvedMethod,
      url = url,
      headers = headers,
      body = body,
      auth = auth,
    )
    return RequestNode(id = ModelFactory.newId(), name = deriveName(url), protocol = RequestProtocol.HTTP, http = request)
  }

  private fun tokenize(command: String): List<String> {
    val normalized = command.replace(Regex("\\\\\\r?\\n"), " ")
    val tokens = mutableListOf<String>()
    val current = StringBuilder()
    var quote: Char? = null
    var hasToken = false

    for (char in normalized) {
      if (quote != null) {
        if (char == quote) quote = null else current.append(char)
        continue
      }
      when (char) {
        '"', '\'' -> {
          quote = char
          hasToken = true
        }
        ' ', '\t', '\n', '\r' -> if (hasToken) {
          tokens += current.toString()
          current.clear()
          hasToken = false
        }
        else -> {
          current.append(char)
          hasToken = true
        }
      }
    }
    if (hasToken) tokens += current.toString()
    return tokens
  }

  private fun parseUrlencoded(data: String): List<KeyValue> =
    data.split("&").filter { it.isNotEmpty() }.map { pair ->
      val eq = pair.indexOf("=")
      val key = if (eq == -1) pair else pair.substring(0, eq)
      val value = if (eq == -1) "" else pair.substring(eq + 1)
      KeyValue(decodeSafe(key), decodeSafe(value), true)
    }

  private fun decodeSafe(value: String): String =
    runCatching { URLDecoder.decode(value, "UTF-8") }.getOrDefault(value)

  private fun hasFormContentType(headers: List<KeyValue>): Boolean =
    headers.any {
      it.key.equals("content-type", ignoreCase = true) &&
        it.value.contains("application/x-www-form-urlencoded", ignoreCase = true)
    }

  private fun looksJson(value: String): Boolean {
    val trimmed = value.trim()
    return trimmed.startsWith("{") || trimmed.startsWith("[")
  }

  private fun deriveName(url: String): String {
    if (url.isEmpty()) return "cURL Request"
    return runCatching {
      val parsed = URI(if (Regex("^[a-z]+://", RegexOption.IGNORE_CASE).containsMatchIn(url)) url else "http://$url")
      val path = parsed.path?.trimEnd('/').orEmpty()
      if (path.isNotEmpty() && path != "/") path else parsed.host ?: url
    }.getOrDefault(url)
  }
}
