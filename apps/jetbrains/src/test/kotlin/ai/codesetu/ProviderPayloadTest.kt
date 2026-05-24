package ai.codesetu

import ai.codesetu.model.ChatMessage
import ai.codesetu.model.ChatCompletionResponse
import ai.codesetu.provider.buildChatCompletionRequestJson
import ai.codesetu.provider.getAssistantText
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlinx.serialization.json.Json

class ProviderPayloadTest {
  @Test
  fun serializesOpenAiCompatibleChatPayload() {
    val payload = buildChatCompletionRequestJson(
      model = "qwen2.5-coder:7b",
      messages = listOf(ChatMessage(role = "user", content = "Hello")),
      maxTokens = 64,
      temperature = 0.1,
    )

    assertContains(payload, "\"model\":\"qwen2.5-coder:7b\"")
    assertContains(payload, "\"max_tokens\":64")
    assertContains(payload, "\"content\":\"Hello\"")
  }

  @Test
  fun extractsProviderRefusalWhenAssistantContentIsNull() {
    val response = Json.decodeFromString<ChatCompletionResponse>(
      """
        {
          "choices": [
            {
              "message": {
                "role": "assistant",
                "content": null,
                "refusal": "I cannot inspect secret values."
              }
            }
          ]
        }
      """.trimIndent(),
    )

    assertEquals("I cannot inspect secret values.", getAssistantText(response))
  }
}
