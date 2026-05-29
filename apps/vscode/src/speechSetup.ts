/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import * as vscode from "vscode";

import { storeSpeechApiKey } from "./secretStorage";

interface SpeechSetupDefaults {
  baseUrl: string;
  model: string;
  apiKeyPrompt: string;
  needsKey: boolean;
}

const PROVIDER_DEFAULTS: Record<string, SpeechSetupDefaults> = {
  browser: {
    baseUrl: "",
    model: "",
    apiKeyPrompt: "",
    needsKey: false,
  },
  sarvam: {
    baseUrl: "https://api.sarvam.ai",
    model: "saarika:v2",
    apiKeyPrompt: "Sarvam API key (Saarika STT)",
    needsKey: true,
  },
  "openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    model: "whisper-1",
    apiKeyPrompt: "API key for the /v1/audio/transcriptions endpoint",
    needsKey: true,
  },
  huggingface: {
    baseUrl: "https://router.huggingface.co/v1",
    model: "openai/whisper-large-v3",
    apiKeyPrompt: "Hugging Face token (hf_...)",
    needsKey: true,
  },
};

export async function setupCodeSetuSpeechProvider(secrets: vscode.SecretStorage): Promise<void> {
  const provider = await vscode.window.showQuickPick(
    [
      { label: "browser", description: "WebSpeech API in the chat webview — no server, no key" },
      { label: "sarvam", description: "Sarvam Saarika STT (Indic languages first-class)" },
      {
        label: "openai-compatible",
        description: "/v1/audio/transcriptions — OpenAI, Groq, local whisper.cpp",
      },
      { label: "huggingface", description: "Hugging Face Inference Router (Whisper-large-v3)" },
    ],
    { placeHolder: "Choose a CodeSetu speech provider" },
  );
  if (provider === undefined) return;

  const defaults = PROVIDER_DEFAULTS[provider.label] ?? PROVIDER_DEFAULTS.browser;
  if (defaults === undefined) return;

  const configuration = vscode.workspace.getConfiguration("codesetu.speech");
  await configuration.update("sttProvider", provider.label, vscode.ConfigurationTarget.Global);

  if (!defaults.needsKey) {
    void vscode.window.showInformationMessage(
      `CodeSetu speech: using the ${provider.label} backend (no key needed).`,
    );
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    prompt: "Speech base URL",
    value: defaults.baseUrl,
  });
  if (baseUrl === undefined) return;

  const model = await vscode.window.showInputBox({
    prompt: "STT model id",
    value: defaults.model,
  });
  if (model === undefined) return;

  const apiKey = await vscode.window.showInputBox({
    password: true,
    prompt: defaults.apiKeyPrompt,
  });
  if (apiKey === undefined) return;

  await configuration.update("sttBaseUrl", baseUrl.trim(), vscode.ConfigurationTarget.Global);
  await configuration.update("sttModel", model.trim(), vscode.ConfigurationTarget.Global);
  await storeSpeechApiKey(secrets, apiKey);

  void vscode.window.showInformationMessage("CodeSetu speech provider settings updated.");
}
