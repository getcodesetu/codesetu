package ai.codesetu.provider

import ai.codesetu.model.ChatMessage
import ai.codesetu.settings.CodeSetuSettingsState
import kotlin.system.measureTimeMillis

data class ProviderDiagnosticResult(
  val status: String,
  val message: String,
  val latencyMs: Long? = null,
)

fun runProviderDiagnostic(client: CodeSetuProviderClient = CodeSetuProviderClient()): ProviderDiagnosticResult {
  val state = CodeSetuSettingsState.getInstance().state

  if (state.model.isBlank()) {
    return ProviderDiagnosticResult(
      "missing-config",
      "CodeSetu needs a model before it can send chat requests.",
    )
  }

  return try {
    var text = ""
    val latency = measureTimeMillis {
      text = client.chat(
        messages = listOf(
          ChatMessage("system", "You are CodeSetu diagnostics."),
          ChatMessage("user", "Reply with OK."),
        ),
        maxTokens = 8,
        temperature = 0.0,
      )
    }
    ProviderDiagnosticResult(
      "ok",
      if (text.isBlank()) "Provider responded." else "Provider responded: $text",
      latency,
    )
  } catch (error: Exception) {
    ProviderDiagnosticResult("error", error.message ?: error.toString())
  }
}
