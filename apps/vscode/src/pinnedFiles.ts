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

// Cap how many files one pinned folder expands to, so pinning a large directory
// can't silently flood the context with hundreds of files.
const MAX_PINNED_FOLDER_FILES = 24;

/** A pinned folder path is denoted by a trailing slash (e.g. "src/auth/"). */
function isFolderPin(path: string): boolean {
  return path.endsWith("/");
}

/** Strip characters that aren't part of a path so a query can't do anything odd. */
function sanitizeQuery(query: string): string {
  return query.replace(/[^a-zA-Z0-9_\-./]/g, "");
}

/** Strip glob metacharacters so a user's query can't break the search pattern. */
export function toSearchGlob(query: string): string {
  const safe = sanitizeQuery(query);
  return safe.length === 0 ? "**/*" : `**/*${safe}*`;
}

/**
 * Find workspace files and folders whose path matches the (substring) query,
 * for the chat composer's @-mention picker. Folders are returned with a
 * trailing slash so the UI (and {@link readPinnedFiles}) can tell them apart.
 * Results are workspace-relative, shortest first so the closest matches surface
 * at the top.
 */
export async function searchWorkspaceFiles(
  vscode: VSCodeApi,
  query: string,
  limit = 20,
): Promise<string[]> {
  const uris = await vscode.workspace.findFiles(toSearchGlob(query), EXCLUDE_GLOB, limit * 8);
  const files = uris.map((uri) => vscode.workspace.asRelativePath(uri, false));

  // Derive matching folders from the ancestor directories of matched files —
  // findFiles only returns files, so a folder surfaces when it (or something
  // under it) matches the query.
  const needle = sanitizeQuery(query).toLowerCase();
  const folders = new Set<string>();
  for (const file of files) {
    const parts = file.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      const dir = parts.slice(0, i).join("/");
      if (needle.length === 0 || dir.toLowerCase().includes(needle)) {
        folders.add(`${dir}/`);
      }
    }
  }

  const entries = [...folders, ...files];
  entries.sort((a, b) => a.length - b.length || a.localeCompare(b));
  return entries.slice(0, limit);
}

/**
 * Read the user's pinned files into snippets for the model context. A pinned
 * folder (trailing slash) expands into the files under it (capped, honouring
 * the same excludes as search). Silently skips anything that can't be opened
 * (deleted, binary, excluded) so one bad pin doesn't fail the whole turn.
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
    if (isFolderPin(path)) {
      await readFolderPin(vscode, root, path, seen, snippets);
      continue;
    }
    await readFilePin(vscode, root, path, snippets);
  }
  return snippets;
}

async function readFilePin(
  vscode: VSCodeApi,
  root: vscodeTypes.WorkspaceFolder,
  path: string,
  snippets: WorkspaceSnippet[],
): Promise<void> {
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

async function readFolderPin(
  vscode: VSCodeApi,
  root: vscodeTypes.WorkspaceFolder,
  folder: string,
  seen: Set<string>,
  snippets: WorkspaceSnippet[],
): Promise<void> {
  let rels: string[];
  try {
    const uris = await vscode.workspace.findFiles(
      `${folder}**/*`,
      EXCLUDE_GLOB,
      MAX_PINNED_FOLDER_FILES,
    );
    rels = uris.map((uri) => vscode.workspace.asRelativePath(uri, false));
  } catch {
    return;
  }
  rels.sort((a, b) => a.length - b.length || a.localeCompare(b));
  for (const rel of rels) {
    if (seen.has(rel)) {
      continue;
    }
    seen.add(rel);
    await readFilePin(vscode, root, rel, snippets);
  }
}
