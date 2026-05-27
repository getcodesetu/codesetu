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

/** Key under which the provider API key is stored in {@link vscode.SecretStorage}. */
export const API_KEY_SECRET = "codesetu.apiKey";

/** Reads the stored API key, returning `undefined` when none is set. */
export async function getStoredApiKey(secrets: vscode.SecretStorage): Promise<string | undefined> {
  const value = (await secrets.get(API_KEY_SECRET))?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

/** Stores (or clears, when blank) the provider API key. */
export async function storeApiKey(secrets: vscode.SecretStorage, apiKey: string): Promise<void> {
  const trimmed = apiKey.trim();

  if (trimmed.length === 0) {
    await secrets.delete(API_KEY_SECRET);
    return;
  }

  await secrets.store(API_KEY_SECRET, trimmed);
}

/**
 * Moves any API key left in the (now deprecated) `codesetu.apiKey` setting into
 * the OS secret store, then clears the plaintext copy. Safe to call on every
 * activation; it is a no-op once the setting is empty.
 */
export async function migrateApiKeyFromConfiguration(secrets: vscode.SecretStorage): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("codesetu");
  const inspected = configuration.inspect<string>("apiKey");
  const legacyValue = (
    inspected?.workspaceFolderValue ??
    inspected?.workspaceValue ??
    inspected?.globalValue ??
    ""
  ).trim();

  if (legacyValue.length === 0) {
    return;
  }

  if ((await getStoredApiKey(secrets)) === undefined) {
    await storeApiKey(secrets, legacyValue);
  }

  await clearConfigurationApiKey(configuration, inspected);
}

async function clearConfigurationApiKey(
  configuration: vscode.WorkspaceConfiguration,
  inspected: ReturnType<vscode.WorkspaceConfiguration["inspect"]>,
): Promise<void> {
  const targets: vscode.ConfigurationTarget[] = [];

  if (inspected?.globalValue !== undefined) {
    targets.push(vscode.ConfigurationTarget.Global);
  }

  if (inspected?.workspaceValue !== undefined) {
    targets.push(vscode.ConfigurationTarget.Workspace);
  }

  if (inspected?.workspaceFolderValue !== undefined) {
    targets.push(vscode.ConfigurationTarget.WorkspaceFolder);
  }

  for (const target of targets) {
    // Best-effort: clearing a workspace-scoped value fails when no workspace is
    // open, which is fine — the value simply stays until a workspace is loaded.
    await Promise.resolve(configuration.update("apiKey", undefined, target)).then(
      undefined,
      () => undefined,
    );
  }
}
