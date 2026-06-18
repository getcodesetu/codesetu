package ai.codesetu.completion

import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.settings.CodeSetuSettingsState
import com.intellij.codeInsight.inline.completion.DebouncedInlineCompletionProvider
import com.intellij.codeInsight.inline.completion.InlineCompletionEvent
import com.intellij.codeInsight.inline.completion.InlineCompletionProviderID
import com.intellij.codeInsight.inline.completion.InlineCompletionRequest
import com.intellij.codeInsight.inline.completion.elements.InlineCompletionGrayTextElement
import com.intellij.codeInsight.inline.completion.suggestion.InlineCompletionSingleSuggestion
import com.intellij.codeInsight.inline.completion.suggestion.InlineCompletionSuggestion
import com.intellij.openapi.application.readAction
import com.intellij.openapi.util.UserDataHolderBase
import java.util.concurrent.atomic.AtomicReference
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.withContext

/**
 * Ghost-text fill-in-the-middle completions as you type. Extends the platform's
 * [DebouncedInlineCompletionProvider] so a burst of keystrokes only fires one
 * request and a superseding keystroke cancels the in-flight coroutine. A
 * one-entry cache serves an identical re-request (same prefix + suffix) without
 * another round-trip. Mirrors the VS Code inline-completion provider.
 */
class CodeSetuInlineCompletionProvider : DebouncedInlineCompletionProvider() {
  private val client = CodeSetuProviderClient()
  private val cache = AtomicReference<CacheEntry?>(null)

  override val id = InlineCompletionProviderID("CodeSetu")

  override fun isEnabled(event: InlineCompletionEvent): Boolean {
    if (!CodeSetuSettingsState.getInstance().state.inlineCompletionsEnabled) return false
    // Trigger while typing and on an explicit manual call; ignore the noisier
    // events (lookup, focus) that would fire requests the user didn't ask for.
    return event is InlineCompletionEvent.DocumentChange || event is InlineCompletionEvent.DirectCall
  }

  override suspend fun getDebounceDelay(request: InlineCompletionRequest): Duration =
    CodeSetuSettingsState.getInstance().state.fimDebounceMs.coerceAtLeast(0).milliseconds

  override suspend fun getSuggestionDebounced(
    request: InlineCompletionRequest,
  ): InlineCompletionSuggestion {
    val settings = CodeSetuSettingsState.getInstance().state
    val (text, offset) = readAction { request.document.text to request.endOffset }
    val fim = buildFimContext(text, offset, settings.fimMaxPrefixChars, settings.fimMaxSuffixChars)
    if (fim.prompt.isEmpty() && fim.suffix.isEmpty()) return InlineCompletionSuggestion.Empty

    cache.get()?.let { entry ->
      if (entry.prompt == fim.prompt && entry.suffix == fim.suffix) return grayText(entry.text)
    }

    val completion = withContext(Dispatchers.IO) {
      runCatching {
        client.completeFim(
          prompt = fim.prompt,
          suffix = fim.suffix,
          maxTokens = settings.fimMaxTokens,
          stop = listOf("\n\n", "\n```"),
        )
      }.getOrDefault("")
    }

    if (completion.isEmpty()) return InlineCompletionSuggestion.Empty
    cache.set(CacheEntry(fim.prompt, fim.suffix, completion))
    return grayText(completion)
  }

  private fun grayText(text: String): InlineCompletionSuggestion =
    InlineCompletionSingleSuggestion.build(
      UserDataHolderBase(),
      flowOf(InlineCompletionGrayTextElement(text)),
    )

  private data class CacheEntry(val prompt: String, val suffix: String, val text: String)
}
