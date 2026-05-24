package ai.codesetu.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class ProviderKind(val id: String) {
  SARVAM("sarvam"),
  OPENAI_COMPATIBLE("openai-compatible");

  companion object {
    fun fromId(id: String): ProviderKind =
      entries.firstOrNull { it.id == id } ?: SARVAM
  }
}

enum class IdeActionId(val id: String) {
  EXPLAIN("explain"),
  REFACTOR("refactor"),
  WRITE_TESTS("write-tests"),
  FIX_BUG("fix-bug"),
  ADD_DOCS("add-docs"),
}

data class WorkspaceSnippet(
  val path: String,
  val languageId: String? = null,
  val text: String,
)

data class IdeContextPayload(
  val activeFilePath: String? = null,
  val languageId: String? = null,
  val selectedText: String? = null,
  val activeFileText: String? = null,
  val cursorPrefix: String? = null,
  val cursorSuffix: String? = null,
  val relatedSnippets: List<WorkspaceSnippet> = emptyList(),
)

data class WorkspaceInstruction(
  val id: String,
  val name: String,
  val description: String,
  val sourcePath: String,
  val body: String,
)

@Serializable
data class ChatMessage(
  val role: String,
  val content: String,
)

@Serializable
data class ChatCompletionRequest(
  val model: String,
  val messages: List<ChatMessage>,
  val temperature: Double = 0.2,
  @SerialName("max_tokens") val maxTokens: Int = 1024,
  val stream: Boolean = false,
)

@Serializable
data class ChatCompletionResponse(
  val choices: List<ChatChoice> = emptyList(),
)

@Serializable
data class ChatChoice(
  val message: ChatCompletionMessage? = null,
)

@Serializable
data class ChatCompletionMessage(
  val role: String? = null,
  val content: String? = null,
  val refusal: String? = null,
)

@Serializable
data class ChatCompletionChunk(
  val choices: List<ChatChunkChoice> = emptyList(),
)

@Serializable
data class ChatChunkChoice(
  val delta: ChatCompletionDelta? = null,
)

@Serializable
data class ChatCompletionDelta(
  val content: String? = null,
  val refusal: String? = null,
)
