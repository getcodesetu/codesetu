package ai.codesetu.settings

import ai.codesetu.model.ProviderKind

/**
 * Curated, reliably-served chat models offered in the model picker. Users can
 * still type any other model id (Hub repo id, dedicated endpoint model, etc.).
 */
object CodeSetuModelCatalog {
  val HUGGINGFACE_MODELS: List<String> = listOf(
    "meta-llama/Llama-3.3-70B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen2.5-Coder-32B-Instruct",
    "deepseek-ai/DeepSeek-V3-0324",
    "meta-llama/Llama-3.1-8B-Instruct",
    "google/gemma-2-27b-it",
    "mistralai/Mistral-Small-24B-Instruct-2501",
  )

  fun suggestionsFor(providerId: String): List<String> =
    if (ProviderKind.fromId(providerId) == ProviderKind.HUGGING_FACE) HUGGINGFACE_MODELS else emptyList()
}
