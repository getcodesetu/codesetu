package ai.codesetu

import ai.codesetu.model.IdeActionId
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.prompts.buildActionUserMessage
import kotlin.test.Test
import kotlin.test.assertContains

class PromptBuilderTest {
  @Test
  fun buildsWriteTestsPromptWithSelectedCode() {
    val message = buildActionUserMessage(
      actionId = IdeActionId.WRITE_TESTS,
      context = IdeContextPayload(
        activeFilePath = "src/service.kt",
        languageId = "kotlin",
        selectedText = "fun add(a: Int, b: Int) = a + b",
      ),
      instructions = emptyList(),
    )

    assertContains(message, "Write focused tests")
    assertContains(message, "src/service.kt")
    assertContains(message, "fun add")
  }
}
