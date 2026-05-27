package ai.codesetu

import ai.codesetu.settings.CodeSetuModelCatalog
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ModelCatalogTest {
  @Test
  fun suggestsHuggingFaceModels() {
    val models = CodeSetuModelCatalog.suggestionsFor("huggingface")

    assertTrue(models.isNotEmpty())
    assertTrue(models.contains("meta-llama/Llama-3.3-70B-Instruct"))
  }

  @Test
  fun offersNoCuratedListForOtherProviders() {
    assertEquals(emptyList(), CodeSetuModelCatalog.suggestionsFor("sarvam"))
    assertEquals(emptyList(), CodeSetuModelCatalog.suggestionsFor("openai-compatible"))
  }
}
