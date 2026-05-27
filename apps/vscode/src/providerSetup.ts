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

const DEFAULT_SARVAM_CHAT_MODEL = "sarvam-30b";

export async function setupCodeSetuProvider(secrets: vscode.SecretStorage): Promise<void> {
  const provider = await vscode.window.showQuickPick(
    [
      { label: "sarvam", description: "Sarvam hosted or compatible endpoint" },
      {
        label: "openai-compatible",
        description: "Ollama, vLLM, SGLang, OpenRouter, or compatible API",
      },
    ],
    { placeHolder: "Choose a CodeSetu provider" },
  );

  if (provider === undefined) {
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    prompt: "Base URL",
    value: provider.label === "sarvam" ? "https://api.sarvam.ai/v1" : "http://localhost:11434/v1",
  });

  if (baseUrl === undefined) {
    return;
  }

  const model = await vscode.window.showInputBox({
    prompt: "Model id",
    value: provider.label === "openai-compatible" ? "qwen2.5-coder:7b" : DEFAULT_SARVAM_CHAT_MODEL,
  });

  if (model === undefined) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    password: true,
    prompt: "API key",
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
