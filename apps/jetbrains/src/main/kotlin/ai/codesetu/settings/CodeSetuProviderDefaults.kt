package ai.codesetu.settings

const val DEFAULT_CODESETU_BASE_URL = "https://api.sarvam.ai/v1"
const val DEFAULT_CODESETU_MODEL = "sarvam-30b"

fun resolveCodeSetuModel(model: String): String =
  model.ifBlank { DEFAULT_CODESETU_MODEL }
