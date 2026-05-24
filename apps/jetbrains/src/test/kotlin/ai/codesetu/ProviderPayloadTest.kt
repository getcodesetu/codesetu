package ai.codesetu

import ai.codesetu.model.ChatMessage
import ai.codesetu.provider.buildChatCompletionRequestJson
import kotlin.test.Test
import kotlin.test.assertContains

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
}
