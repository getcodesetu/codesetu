/*
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Mirrors the VSCode `CodeSetu: Setup Speech Provider` wizard. Walks the user
 * through provider → base URL → STT model → API key and persists to
 * CodeSetuSettingsState + the PasswordSafe-backed speech key store.
 */
package ai.codesetu.actions

import ai.codesetu.settings.CodeSetuSettingsState
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.popup.JBPopupFactory

private data class SpeechProviderOption(
  val id: String,
  val label: String,
  val description: String,
  val baseUrl: String,
  val model: String,
  val apiKeyPrompt: String,
  val needsKey: Boolean,
)

private val OPTIONS = listOf(
  SpeechProviderOption(
    id = "browser",
    label = "browser",
    description = "WebSpeech API in the chat webview — does NOT work in JCEF, pick a server provider instead",
    baseUrl = "",
    model = "",
    apiKeyPrompt = "",
    needsKey = false,
  ),
  SpeechProviderOption(
    id = "sarvam",
    label = "sarvam",
    description = "Sarvam Saarika STT (Indic languages first-class) — recommended for JetBrains",
    baseUrl = "https://api.sarvam.ai",
    model = "saarika:v2",
    apiKeyPrompt = "Sarvam API key (Saarika STT)",
    needsKey = true,
  ),
  SpeechProviderOption(
    id = "openai-compatible",
    label = "openai-compatible",
    description = "/v1/audio/transcriptions — OpenAI, Groq, local whisper.cpp",
    baseUrl = "https://api.openai.com/v1",
    model = "whisper-1",
    apiKeyPrompt = "API key for the /v1/audio/transcriptions endpoint",
    needsKey = true,
  ),
  SpeechProviderOption(
    id = "huggingface",
    label = "huggingface",
    description = "Hugging Face Inference Router (Whisper-large-v3 by default)",
    baseUrl = "https://router.huggingface.co/v1",
    model = "openai/whisper-large-v3",
    apiKeyPrompt = "Hugging Face token (hf_...)",
    needsKey = true,
  ),
)

class SetupSpeechProviderAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    openWizard(project)
  }

  companion object {
    /** Reusable entry point so other actions / popups can pop the wizard. */
    fun openWizard(project: com.intellij.openapi.project.Project) {
      ApplicationManager.getApplication().invokeLater {
        val labels = OPTIONS.map { "${it.label} — ${it.description}" }
        JBPopupFactory.getInstance()
          .createPopupChooserBuilder(labels)
          .setTitle("Choose a CodeSetu speech provider")
          .setItemChosenCallback { choice ->
            val option = OPTIONS.firstOrNull { "${it.label} — ${it.description}" == choice }
              ?: return@setItemChosenCallback
            applyChoice(project, option)
          }
          .createPopup()
          .showInFocusCenter()
      }
    }

    private fun applyChoice(
      project: com.intellij.openapi.project.Project,
      option: SpeechProviderOption,
    ) {
      val state = CodeSetuSettingsState.getInstance()
      state.state.speechSttProvider = option.id

      if (!option.needsKey) {
        Messages.showInfoMessage(
          project,
          "CodeSetu speech: using the ${option.id} backend (no key needed).",
          "CodeSetu",
        )
        return
      }

      val baseUrl = Messages.showInputDialog(
        project,
        "Speech base URL",
        "Configure Speech Provider",
        null,
        option.baseUrl,
        null,
      ) ?: return

      val model = Messages.showInputDialog(
        project,
        "STT model id",
        "Configure Speech Provider",
        null,
        option.model,
        null,
      ) ?: return

      val apiKey = Messages.showPasswordDialog(
        project,
        option.apiKeyPrompt,
        "Configure Speech Provider",
        null,
      ) ?: return

      state.state.speechSttBaseUrl = baseUrl.trim()
      state.state.speechSttModel = model.trim()
      if (apiKey.isNotBlank()) {
        state.setSpeechApiKey(apiKey)
      }

      Messages.showInfoMessage(
        project,
        "CodeSetu speech provider settings updated.",
        "CodeSetu",
      )
    }
  }
}
