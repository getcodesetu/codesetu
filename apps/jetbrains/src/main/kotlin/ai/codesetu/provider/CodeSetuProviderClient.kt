package ai.codesetu.provider

import ai.codesetu.model.ChatCompletionRequest
import ai.codesetu.model.ChatCompletionResponse
import ai.codesetu.model.ChatCompletionChunk
import ai.codesetu.model.ChatMessage
import ai.codesetu.model.ProviderKind
import ai.codesetu.settings.CodeSetuSettingsState
import ai.codesetu.settings.resolveCodeSetuModel
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class CodeSetuProviderClient(
  private val httpClient: HttpClient = HttpClient.newHttpClient(),
  private val json: Json = Json { ignoreUnknownKeys = true },
) {
  fun chat(messages: List<ChatMessage>, maxTokens: Int = 4096, temperature: Double = 0.2): String {
    val state = CodeSetuSettingsState.getInstance().state
    val body = buildChatCompletionRequestJson(
      model = resolveCodeSetuModel(state.model),
      messages = messages,
      maxTokens = maxTokens,
      temperature = temperature,
      reasoningEffort = reasoningEffortFor(state.provider),
      json = json,
    )
    val request = HttpRequest.newBuilder()
      .uri(URI.create(state.baseUrl.trimEnd('/') + "/chat/completions"))
      .header("Authorization", "Bearer ${CodeSetuSettingsState.getInstance().getApiKey()}")
      .header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString(body))
      .build()
    val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())

    if (response.statusCode() !in 200..299) {
      error("Provider request failed with HTTP ${response.statusCode()}: ${response.body()}")
    }

    return getAssistantText(json.decodeFromString<ChatCompletionResponse>(response.body()))
  }

  fun streamChat(
    messages: List<ChatMessage>,
    maxTokens: Int = 4096,
    temperature: Double = 0.2,
    onChunk: (StreamPiece) -> Unit,
  ): String {
    val state = CodeSetuSettingsState.getInstance().state
    val body = buildChatCompletionRequestJson(
      model = resolveCodeSetuModel(state.model),
      messages = messages,
      maxTokens = maxTokens,
      temperature = temperature,
      reasoningEffort = reasoningEffortFor(state.provider),
      stream = true,
      json = json,
    )
    val request = HttpRequest.newBuilder()
      .uri(URI.create(state.baseUrl.trimEnd('/') + "/chat/completions"))
      .header("Authorization", "Bearer ${CodeSetuSettingsState.getInstance().getApiKey()}")
      .header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString(body))
      .build()
    val response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream())

    if (response.statusCode() !in 200..299) {
      val errorBody = response.body().bufferedReader().use { it.readText() }
      error("Provider request failed with HTTP ${response.statusCode()}: $errorBody")
    }

    val assistantText = StringBuilder()
    response.body().bufferedReader().use { reader ->
      while (true) {
        val line = reader.readLine() ?: break
        val trimmed = line.trim()

        if (!trimmed.startsWith("data:")) {
          continue
        }

        val data = trimmed.removePrefix("data:").trim()

        if (data == "[DONE]") {
          break
        }

        // Skip malformed/partial SSE payloads instead of aborting the whole stream.
        val piece = try {
          getAssistantChunkPiece(json.decodeFromString<ChatCompletionChunk>(data))
        } catch (error: Exception) {
          StreamPiece()
        }

        piece.reasoning?.takeIf { it.isNotEmpty() }?.let { onChunk(StreamPiece(reasoning = it)) }
        piece.content?.takeIf { it.isNotEmpty() }?.let {
          assistantText.append(it)
          onChunk(StreamPiece(content = it))
        }
      }
    }

    return assistantText.toString()
  }
}

/** A streamed slice of a completion: answer `content`, `reasoning`, or neither. */
data class StreamPiece(val content: String? = null, val reasoning: String? = null)

// Sarvam needs a low reasoning effort to avoid exhausting its token budget;
// other providers (OpenAI-compatible, Hugging Face) may reject an unknown field.
private fun reasoningEffortFor(providerId: String): String? =
  if (ProviderKind.fromId(providerId) == ProviderKind.SARVAM) "low" else null

fun getAssistantText(response: ChatCompletionResponse): String {
  val message = response.choices.firstOrNull()?.message
  return message?.content ?: message?.refusal.orEmpty()
}

fun getAssistantChunkText(chunk: ChatCompletionChunk): String {
  val delta = chunk.choices.firstOrNull()?.delta
  return delta?.content ?: delta?.refusal.orEmpty()
}

fun getAssistantChunkPiece(chunk: ChatCompletionChunk): StreamPiece {
  val delta = chunk.choices.firstOrNull()?.delta
  return StreamPiece(
    content = delta?.content ?: delta?.refusal,
    reasoning = delta?.reasoningContent ?: delta?.reasoning,
  )
}

fun buildChatCompletionRequestJson(
  model: String,
  messages: List<ChatMessage>,
  maxTokens: Int,
  temperature: Double,
  reasoningEffort: String? = null,
  stream: Boolean = false,
  json: Json = Json,
): String =
  json.encodeToString(
    ChatCompletionRequest(
      model = model,
      messages = messages,
      maxTokens = maxTokens,
      temperature = temperature,
      reasoningEffort = reasoningEffort,
      stream = stream,
    ),
  )
