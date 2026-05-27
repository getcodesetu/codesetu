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

import { storeApiKey } from "./secretStorage";

interface ProviderSetupDefaults {
  baseUrl: string;
  model: string;
  apiKeyPrompt: string;
}

const SARVAM_DEFAULTS: ProviderSetupDefaults = {
  baseUrl: "https://api.sarvam.ai/v1",
  model: "sarvam-30b",
  apiKeyPrompt: "Sarvam API key",
};

const PROVIDER_DEFAULTS: Record<string, ProviderSetupDefaults> = {
  sarvam: SARVAM_DEFAULTS,
  "openai-compatible": {
    baseUrl: "http://localhost:11434/v1",
    model: "qwen2.5-coder:7b",
    apiKeyPrompt: "API key (use 'ollama' for a local Ollama server)",
  },
  huggingface: {
    baseUrl: "https://router.huggingface.co/v1",
    model: "meta-llama/Llama-3.3-70B-Instruct",
    apiKeyPrompt: "Hugging Face token (hf_...)",
  },
};

export async function setupCodeSetuProvider(secrets: vscode.SecretStorage): Promise<void> {
  const provider = await vscode.window.showQuickPick(
    [
      { label: "sarvam", description: "Sarvam hosted or compatible endpoint" },
      {
        label: "openai-compatible",
        description: "Ollama, vLLM, SGLang, OpenRouter, or compatible API",
      },
      {
        label: "huggingface",
        description: "Hugging Face router, a dedicated Inference Endpoint, or self-hosted TGI",
      },
    ],
    { placeHolder: "Choose a CodeSetu provider" },
  );

  if (provider === undefined) {
    return;
  }

  const defaults = PROVIDER_DEFAULTS[provider.label] ?? SARVAM_DEFAULTS;

  const baseUrl = await vscode.window.showInputBox({
    prompt: "Base URL",
    value: defaults.baseUrl,
  });

  if (baseUrl === undefined) {
    return;
  }

  const model = await vscode.window.showInputBox({
    prompt: provider.label === "huggingface" ? "Model id (Hugging Face repo id)" : "Model id",
    value: defaults.model,
  });

  if (model === undefined) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    password: true,
    prompt: defaults.apiKeyPrompt,
    value: provider.label === "openai-compatible" && baseUrl.includes("localhost") ? "ollama" : "",
  });

  if (apiKey === undefined) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration("codesetu");
  await configuration.update("provider", provider.label, vscode.ConfigurationTarget.Global);
  await configuration.update("baseUrl", baseUrl.trim(), vscode.ConfigurationTarget.Global);
  await configuration.update("model", model.trim(), vscode.ConfigurationTarget.Global);
  // The API key goes to the OS secret store, never to settings.json.
  await storeApiKey(secrets, apiKey);

  void vscode.window.showInformationMessage("CodeSetu provider settings updated.");
}
