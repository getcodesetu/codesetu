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

import { emptyState, type PersistedState } from "./protocol";

const GLOBAL_STATE_KEY = "codesetuApiClient.state";

/**
 * Loads and saves API Client state. Prefers a workspace file
 * (.codesetu/api/store.json) so collections can be committed alongside code;
 * falls back to extension global state when no workspace folder is open.
 */
export class ApiClientStorage {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  private get workspaceFile(): vscode.Uri | undefined {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) {
      return undefined;
    }
    return vscode.Uri.joinPath(folder.uri, ".codesetu", "api", "store.json");
  }

  async load(): Promise<PersistedState> {
    const file = this.workspaceFile;
    if (file) {
      try {
        const bytes = await vscode.workspace.fs.readFile(file);
        return normalizeState(JSON.parse(Buffer.from(bytes).toString("utf-8")));
      } catch {
        // No workspace store yet — fall through to global state.
      }
    }
    const stored = this.context.globalState.get<PersistedState>(GLOBAL_STATE_KEY);
    return stored ? normalizeState(stored) : emptyState();
  }

  async save(state: PersistedState): Promise<void> {
    const normalized = normalizeState(state);
    const file = this.workspaceFile;
    if (file) {
      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(file, ".."));
        await vscode.workspace.fs.writeFile(
          file,
          Buffer.from(JSON.stringify(normalized, null, 2), "utf-8"),
        );
        return;
      } catch (error) {
        this.outputChannel.appendLine(
          `Failed to write workspace store, using global state: ${formatError(error)}`,
        );
      }
    }
    await this.context.globalState.update(GLOBAL_STATE_KEY, normalized);
  }
}

function normalizeState(value: unknown): PersistedState {
  if (typeof value !== "object" || value === null) {
    return emptyState();
  }
  const candidate = value as Partial<PersistedState>;
  return {
    collections: Array.isArray(candidate.collections) ? candidate.collections : [],
    environments: Array.isArray(candidate.environments) ? candidate.environments : [],
    globals: Array.isArray(candidate.globals) ? candidate.globals : [],
    history: Array.isArray(candidate.history) ? candidate.history : [],
    ...(typeof candidate.activeEnvironmentId === "string"
      ? { activeEnvironmentId: candidate.activeEnvironmentId }
      : {}),
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
