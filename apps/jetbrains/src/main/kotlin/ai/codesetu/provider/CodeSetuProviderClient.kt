package ai.codesetu.provider

import ai.codesetu.model.ChatCompletionRequest
import ai.codesetu.model.ChatCompletionResponse
import ai.codesetu.model.ChatMessage
import ai.codesetu.settings.CodeSetuSettingsState
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
  fun chat(messages: List<ChatMessage>, maxTokens: Int = 1024, temperature: Double = 0.2): String {
    val state = CodeSetuSettingsState.getInstance().state
    val body = buildChatCompletionRequestJson(
      model = state.model,
      messages = messages,
      maxTokens = maxTokens,
      temperature = temperature,
      json = json,
    )
    val request = HttpRequest.newBuilder()
      .uri(URI.create(state.baseUrl.trimEnd('/') + "/chat/completions"))
      .header("Authorization", "Bearer ${state.apiKey}")
      .header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString(body))
      .build()
    val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())

    if (response.statusCode() !in 200..299) {
      error("Provider request failed with HTTP ${response.statusCode()}: ${response.body()}")
    }

    return getAssistantText(json.decodeFromString<ChatCompletionResponse>(response.body()))
  }
}

fun getAssistantText(response: ChatCompletionResponse): String {
  val message = response.choices.firstOrNull()?.message
  return message?.content ?: message?.refusal.orEmpty()
}

fun buildChatCompletionRequestJson(
  model: String,
  messages: List<ChatMessage>,
  maxTokens: Int,
  temperature: Double,
  json: Json = Json,
): String =
  json.encodeToString(
    ChatCompletionRequest(
      model = model,
      messages = messages,
      maxTokens = maxTokens,
      temperature = temperature,
    ),
  )
