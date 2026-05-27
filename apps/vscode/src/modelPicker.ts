/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from "vscode";

import { summarizeCodeSetuConfiguration } from "./configuration";

const CONFIGURE_PROVIDER_LABEL = "$(gear) Configure provider (base URL, API key)…";
const CUSTOM_ENTRY_LABEL = "$(edit) Enter a custom model id…";

// A short, hand-picked set of chat models that the Hugging Face router reliably
// serves. Users can always pick "Enter a custom model id…" for anything else
// (any Hub repo id, a dedicated endpoint's model, etc.).
const HUGGINGFACE_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct",
  "Qwen/Qwen2.5-72B-Instruct",
  "Qwen/Qwen2.5-Coder-32B-Instruct",
  "deepseek-ai/DeepSeek-V3-0324",
  "meta-llama/Llama-3.1-8B-Instruct",
  "google/gemma-2-27b-it",
  "mistralai/Mistral-Small-24B-Instruct-2501",
];

export async function selectCodeSetuModel(): Promise<void> {
  const summary = summarizeCodeSetuConfiguration();
  const current = summary.model;
  const suggestions = summary.provider === "huggingface" ? HUGGINGFACE_MODELS : [];
  const ordered = dedupeWithCurrentFirst(suggestions, current);

  const items: vscode.QuickPickItem[] = [
    { label: CONFIGURE_PROVIDER_LABEL, alwaysShow: true },
    { label: CUSTOM_ENTRY_LABEL, alwaysShow: true },
    ...ordered.map(
      (model): vscode.QuickPickItem =>
        model === current ? { label: model, description: "current" } : { label: model },
    ),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Select a model for ${summary.provider}${current ? ` (current: ${current})` : ""}`,
    matchOnDescription: true,
  });

  if (picked === undefined) {
    return;
  }

  if (picked.label === CONFIGURE_PROVIDER_LABEL) {
    // Hand off to the full provider setup (provider, base URL, model, token).
    await vscode.commands.executeCommand("codesetu.setupProvider");
    return;
  }

  const model =
    picked.label === CUSTOM_ENTRY_LABEL
      ? await vscode.window.showInputBox({
          prompt: summary.provider === "huggingface" ? "Hugging Face model repo id" : "Model id",
          value: current ?? "",
          ignoreFocusOut: true,
        })
      : picked.label;

  const trimmed = model?.trim();

  if (trimmed === undefined || trimmed.length === 0) {
    return;
  }

  await vscode.workspace
    .getConfiguration("codesetu")
    .update("model", trimmed, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(`CodeSetu model set to ${trimmed}.`);
}

function dedupeWithCurrentFirst(models: string[], current: string | undefined): string[] {
  const withCurrent = current !== undefined && current.length > 0 ? [current, ...models] : models;
  return [...new Set(withCurrent)];
}
