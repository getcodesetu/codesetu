/*
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Host-side speech-to-text client for the JetBrains plugin. Mirrors the
 * contract used by packages/core/src/speech in TypeScript so the wire formats
 * stay aligned with what the VSCode webview produces and consumes.
 */
package ai.codesetu.speech

import ai.codesetu.settings.CodeSetuSettingsState
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.charset.StandardCharsets
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

data class AudioPayload(val mimeType: String, val bytes: ByteArray)

data class SpeechTranscription(val text: String, val language: String? = null)

@Serializable
private data class SarvamTranscribeResponse(
  val transcript: String = "",
  val language_code: String? = null,
)

@Serializable
private data class OpenAiTranscribeResponse(val text: String = "", val language: String? = null)

class CodeSetuSpeechClient(
  private val httpClient: HttpClient = HttpClient.newHttpClient(),
  private val json: Json = Json { ignoreUnknownKeys = true; encodeDefaults = true },
) {
  fun transcribe(audio: AudioPayload, language: String): SpeechTranscription {
    val state = CodeSetuSettingsState.getInstance().state
    return when (state.speechSttProvider) {
      "sarvam" -> transcribeSarvam(audio, language)
      "openai-compatible", "huggingface" -> transcribeOpenAiCompatible(audio, language)
      else -> error(
        "STT provider '${state.speechSttProvider}' is handled in the webview, the host should not be called.",
      )
    }
  }

  private fun transcribeSarvam(audio: AudioPayload, language: String): SpeechTranscription {
    val apiKey = requireSpeechKey()
    val state = CodeSetuSettingsState.getInstance().state
    val baseUrl = state.speechSttBaseUrl.ifBlank { "https://api.sarvam.ai" }.trimEnd('/')
    val model = state.speechSttModel.ifBlank { "saarika:v2" }
    val boundary = "----codesetu-${System.nanoTime()}"
    val body = buildMultipart(
      boundary,
      listOf(
        MultipartPart.File("file", "audio", audio.mimeType, audio.bytes),
        MultipartPart.Text("model", model),
        MultipartPart.Text("language_code", language),
      ),
    )
    val request = HttpRequest.newBuilder()
      .uri(URI.create("$baseUrl/speech-to-text"))
      .header("api-subscription-key", apiKey)
      .header("Content-Type", "multipart/form-data; boundary=$boundary")
      .POST(HttpRequest.BodyPublishers.ofByteArray(body))
      .build()
    val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
    require(response.statusCode() in 200..299) {
      "Sarvam STT failed: HTTP ${response.statusCode()} ${response.body()}"
    }
    val parsed = json.decodeFromString<SarvamTranscribeResponse>(response.body())
    return SpeechTranscription(parsed.transcript, parsed.language_code)
  }

  private fun transcribeOpenAiCompatible(audio: AudioPayload, language: String): SpeechTranscription {
    val apiKey = requireSpeechKey()
    val state = CodeSetuSettingsState.getInstance().state
    val baseUrl = state.speechSttBaseUrl.ifBlank {
      if (state.speechSttProvider == "huggingface") "https://router.huggingface.co/v1" else null
    }?.trimEnd('/') ?: error("Speech STT base URL is required for openai-compatible / huggingface.")
    val model = state.speechSttModel.ifBlank {
      if (state.speechSttProvider == "huggingface") "openai/whisper-large-v3" else "whisper-1"
    }
    val boundary = "----codesetu-${System.nanoTime()}"
    val body = buildMultipart(
      boundary,
      listOf(
        MultipartPart.File("file", "audio", audio.mimeType, audio.bytes),
        MultipartPart.Text("model", model),
        MultipartPart.Text("language", language.substringBefore('-')),
      ),
    )
    val request = HttpRequest.newBuilder()
      .uri(URI.create("$baseUrl/audio/transcriptions"))
      .header("Authorization", "Bearer $apiKey")
      .header("Content-Type", "multipart/form-data; boundary=$boundary")
      .POST(HttpRequest.BodyPublishers.ofByteArray(body))
      .build()
    val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
    require(response.statusCode() in 200..299) {
      "STT failed: HTTP ${response.statusCode()} ${response.body()}"
    }
    val parsed = json.decodeFromString<OpenAiTranscribeResponse>(response.body())
    return SpeechTranscription(parsed.text, parsed.language)
  }

  private fun requireSpeechKey(): String {
    val key = CodeSetuSettingsState.getInstance().getSpeechApiKey()
    require(key.isNotBlank()) {
      "No speech API key set. Open CodeSetu settings and fill in 'Speech API key'."
    }
    return key
  }
}

private sealed class MultipartPart {
  class Text(val name: String, val value: String) : MultipartPart()
  class File(val name: String, val filename: String, val mimeType: String, val bytes: ByteArray) :
    MultipartPart()
}

private fun buildMultipart(boundary: String, parts: List<MultipartPart>): ByteArray {
  val output = java.io.ByteArrayOutputStream()
  fun write(text: String) = output.write(text.toByteArray(StandardCharsets.UTF_8))
  for (part in parts) {
    write("--$boundary\r\n")
    when (part) {
      is MultipartPart.Text -> {
        write("Content-Disposition: form-data; name=\"${part.name}\"\r\n\r\n")
        write(part.value)
        write("\r\n")
      }
      is MultipartPart.File -> {
        write("Content-Disposition: form-data; name=\"${part.name}\"; filename=\"${part.filename}\"\r\n")
        write("Content-Type: ${part.mimeType}\r\n\r\n")
        output.write(part.bytes)
        write("\r\n")
      }
    }
  }
  write("--$boundary--\r\n")
  return output.toByteArray()
}
