package ai.codesetu

import ai.codesetu.settings.DEFAULT_CODESETU_BASE_URL
import ai.codesetu.settings.DEFAULT_CODESETU_MODEL
import ai.codesetu.settings.resolveCodeSetuModel
import kotlin.test.Test
import kotlin.test.assertEquals

class ProviderDefaultsTest {
  @Test
  fun defaultsToSarvam30B() {
    assertEquals("https://api.sarvam.ai/v1", DEFAULT_CODESETU_BASE_URL)
    assertEquals("sarvam-30b", DEFAULT_CODESETU_MODEL)
    assertEquals("sarvam-30b", resolveCodeSetuModel(""))
  }

  @Test
  fun preservesExplicitModel() {
    assertEquals("sarvam-105b", resolveCodeSetuModel("sarvam-105b"))
  }
}
