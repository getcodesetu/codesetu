package ai.codesetu.apiclient.engine

import ai.codesetu.apiclient.model.BodyMode
import ai.codesetu.apiclient.model.FormFieldKind
import ai.codesetu.apiclient.model.RawLanguage
import ai.codesetu.apiclient.model.RequestBody
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

class BuiltBody(val bytes: ByteArray?, val contentType: String?)

/** Kotlin mirror of packages/api-client-core/src/engine/body.ts. */
object BodyBuilder {
  private val json = Json { ignoreUnknownKeys = true }

  fun build(body: RequestBody, fileReader: (String) -> ByteArray): BuiltBody {
    return when (body.mode) {
      BodyMode.NONE -> BuiltBody(null, null)

      BodyMode.RAW -> BuiltBody(
        body.raw.orEmpty().toByteArray(Charsets.UTF_8),
        rawContentType(body.rawLanguage),
      )

      BodyMode.URLENCODED -> {
        val encoded = body.urlencoded
          .filter { it.enabled && it.key.isNotEmpty() }
          .joinToString("&") { "${urlEncode(it.key)}=${urlEncode(it.value)}" }
        BuiltBody(encoded.toByteArray(Charsets.UTF_8), "application/x-www-form-urlencoded")
      }

      BodyMode.GRAPHQL -> {
        val payload = buildJsonObject {
          put("query", JsonPrimitive(body.graphql?.query.orEmpty()))
          put("variables", parseVariables(body.graphql?.variables))
        }
        BuiltBody(json.encodeToString(JsonObject.serializer(), payload).toByteArray(Charsets.UTF_8), "application/json")
      }

      BodyMode.BINARY -> {
        val path = body.binaryFilePath
        if (path.isNullOrEmpty()) BuiltBody(null, null)
        else BuiltBody(fileReader(path), "application/octet-stream")
      }

      BodyMode.FORM_DATA -> buildMultipart(body, fileReader)
    }
  }

  private fun buildMultipart(body: RequestBody, fileReader: (String) -> ByteArray): BuiltBody {
    val boundary = "----CodeSetuFormBoundary" + System.nanoTime().toString(36)
    val out = ByteArrayOutputStream()
    val newline = "\r\n"

    for (field in body.formData) {
      if (!field.enabled || field.key.isEmpty()) continue
      if (field.kind == FormFieldKind.FILE) {
        val path = field.filePath ?: continue
        val fileName = path.substringAfterLast('/').substringAfterLast('\\')
        val contentType = field.contentType ?: "application/octet-stream"
        out.writeText(
          "--$boundary$newline" +
            "Content-Disposition: form-data; name=\"${field.key}\"; filename=\"$fileName\"$newline" +
            "Content-Type: $contentType$newline$newline",
        )
        out.write(fileReader(path))
        out.writeText(newline)
      } else {
        out.writeText(
          "--$boundary$newline" +
            "Content-Disposition: form-data; name=\"${field.key}\"$newline$newline" +
            (field.value.orEmpty()) + newline,
        )
      }
    }
    out.writeText("--$boundary--$newline")

    return BuiltBody(out.toByteArray(), "multipart/form-data; boundary=$boundary")
  }

  private fun parseVariables(raw: String?) =
    if (raw.isNullOrBlank()) JsonObject(emptyMap())
    else runCatching { json.parseToJsonElement(raw) }.getOrElse { JsonObject(emptyMap()) }

  private fun rawContentType(language: RawLanguage?): String = when (language) {
    RawLanguage.JSON -> "application/json"
    RawLanguage.XML -> "application/xml"
    RawLanguage.HTML -> "text/html"
    RawLanguage.JAVASCRIPT -> "application/javascript"
    RawLanguage.TEXT, null -> "text/plain"
  }

  private fun urlEncode(value: String): String = URLEncoder.encode(value, "UTF-8")

  private fun ByteArrayOutputStream.writeText(text: String) = write(text.toByteArray(Charsets.UTF_8))
}
