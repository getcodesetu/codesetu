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

import type { WorkspaceSnippet } from "@codesetu/core";
import type * as vscodeTypes from "vscode";

type VSCodeApi = typeof vscodeTypes;

// Match collectVSCodeContext: never auto-read build output or likely-secret
// files into a model request, even when the user mentions one.
const EXCLUDE_GLOB =
  "{**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.env*,**/*.pem,**/*.key,**/*.pfx,**/*.p12,**/secrets/**,**/.aws/**,**/id_rsa*}";

// Cap each pinned file so a few large files can't blow out the context window;
// buildContextMarkdown trims again on its side, this just bounds what we read.
const MAX_PINNED_FILE_CHARS = 12_000;

/** Strip glob metacharacters so a user's query can't break the search pattern. */
export function toSearchGlob(query: string): string {
  const safe = query.replace(/[^a-zA-Z0-9_\-./]/g, "");
  return safe.length === 0 ? "**/*" : `**/*${safe}*`;
}

/**
 * Find workspace files whose path matches the (substring) query, for the chat
 * composer's @-mention picker. Returns workspace-relative paths, shortest
 * first so the closest matches surface at the top.
 */
export async function searchWorkspaceFiles(
  vscode: VSCodeApi,
  query: string,
  limit = 20,
): Promise<string[]> {
  const uris = await vscode.workspace.findFiles(toSearchGlob(query), EXCLUDE_GLOB, limit * 4);
  const paths = uris.map((uri) => vscode.workspace.asRelativePath(uri, false));
  paths.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return paths.slice(0, limit);
}

/**
 * Read the user's pinned files into snippets for the model context. Silently
 * skips anything that can't be opened (deleted, binary, excluded) so one bad
 * pin doesn't fail the whole turn.
 */
export async function readPinnedFiles(
  vscode: VSCodeApi,
  paths: readonly string[],
): Promise<WorkspaceSnippet[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0 || paths.length === 0) {
    return [];
  }
  const root = folders[0];
  if (root === undefined) {
    return [];
  }
  const seen = new Set<string>();
  const snippets: WorkspaceSnippet[] = [];
  for (const path of paths) {
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    try {
      const uri = vscode.Uri.joinPath(root.uri, path);
      const document = await vscode.workspace.openTextDocument(uri);
      snippets.push({
        path,
        languageId: document.languageId,
        text: document.getText().slice(0, MAX_PINNED_FILE_CHARS),
      });
    } catch {
      // Unreadable pin — skip it rather than failing the turn.
    }
  }
  return snippets;
}
