package ai.codesetu.model

import kotlinx.serialization.Serializable

/** Request body for an OpenAI-compatible `/v1/embeddings` call. */
@Serializable
data class EmbeddingRequest(
  val model: String,
  val input: List<String>,
)

@Serializable
data class EmbeddingResponse(
  val data: List<EmbeddingData> = emptyList(),
)

@Serializable
data class EmbeddingData(
  val embedding: List<Double> = emptyList(),
  val index: Int = 0,
)
