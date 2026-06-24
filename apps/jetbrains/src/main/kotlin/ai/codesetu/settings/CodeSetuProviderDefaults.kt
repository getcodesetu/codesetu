package ai.codesetu.settings

import ai.codesetu.model.ProviderKind

const val DEFAULT_CODESETU_BASE_URL = "https://api.sarvam.ai/v1"
const val DEFAULT_CODESETU_MODEL = "sarvam-30b"

// @workspace embedding defaults. Any OpenAI-compatible /v1/embeddings endpoint
// works, so an air-gapped setup can point at a local server.
const val DEFAULT_EMBEDDING_BASE_URL = "http://localhost:11434/v1"
const val DEFAULT_EMBEDDING_MODEL = "nomic-embed-text"

fun resolveCodeSetuModel(model: String): String =
  model.ifBlank { DEFAULT_CODESETU_MODEL }

fun resolveEmbeddingModel(model: String): String =
  model.ifBlank { DEFAULT_EMBEDDING_MODEL }

data class ProviderDefaults(val baseUrl: String, val model: String)

fun providerDefaults(providerId: String): ProviderDefaults =
  when (ProviderKind.fromId(providerId)) {
    ProviderKind.SARVAM -> ProviderDefaults("https://api.sarvam.ai/v1", "sarvam-30b")
    ProviderKind.OPENAI_COMPATIBLE ->
      ProviderDefaults("http://localhost:11434/v1", "qwen2.5-coder:7b")
    ProviderKind.HUGGING_FACE ->
      ProviderDefaults("https://router.huggingface.co/v1", "meta-llama/Llama-3.3-70B-Instruct")
  }
