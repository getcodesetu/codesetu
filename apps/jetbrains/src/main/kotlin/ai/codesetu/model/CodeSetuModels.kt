package ai.codesetu.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

enum class ProviderKind(val id: String) {
  SARVAM("sarvam"),
  OPENAI_COMPATIBLE("openai-compatible"),
  HUGGING_FACE("huggingface");

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
  // Set on assistant turns that request tool calls, and echoed back verbatim so
  // the follow-up tool-result messages are valid. Null/omitted on plain turns.
  @SerialName("tool_calls") val toolCalls: List<ToolCall>? = null,
  // Set on role="tool" result messages to bind the result to its call.
  @SerialName("tool_call_id") val toolCallId: String? = null,
)

@Serializable
data class ChatCompletionRequest(
  val model: String,
  val messages: List<ChatMessage>,
  val temperature: Double = 0.2,
  @SerialName("max_tokens") val maxTokens: Int = 1024,
  @SerialName("reasoning_effort") val reasoningEffort: String? = null,
  val stream: Boolean = false,
  val tools: List<Tool>? = null,
  @SerialName("tool_choice") val toolChoice: String? = null,
)

/** A tool advertised to the model (OpenAI function-calling shape). */
@Serializable
data class Tool(
  val type: String = "function",
  val function: ToolFunction,
)

@Serializable
data class ToolFunction(
  val name: String,
  val description: String,
  val parameters: JsonObject,
)

/** A tool call requested by the model, or echoed back on the assistant turn. */
@Serializable
data class ToolCall(
  val id: String = "",
  val type: String = "function",
  val function: ToolCallFunction = ToolCallFunction(),
)

@Serializable
data class ToolCallFunction(
  val name: String = "",
  val arguments: String = "",
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
  @SerialName("tool_calls") val toolCalls: List<ToolCall>? = null,
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
  // Reasoning models stream chain-of-thought in a non-standard field; some use
  // `reasoning_content`, others `reasoning`. Captured so the UI can show it.
  @SerialName("reasoning_content") val reasoningContent: String? = null,
  val reasoning: String? = null,
)
