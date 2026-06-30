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

import {
  DEFAULT_EMBEDDING_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
  OpenAIEmbeddingProvider,
  WorkspaceIndex,
  createSearchWorkspaceTool,
  retrieveFromWorkspace,
  updateWorkspaceIndex,
  type AgentTool,
  type RetrievedSnippet,
  type SerializedIndex,
  type WorkspaceFile,
} from "@codesetu/core";
import * as vscode from "vscode";

// Mirror the pinned-file excludes: never feed build output or likely-secret
// files into the index.
const EXCLUDE_GLOB =
  "{**/node_modules/**,**/dist/**,**/build/**,**/out/**,**/.git/**,**/.env*,**/*.pem,**/*.key,**/*.pfx,**/*.p12,**/secrets/**,**/.aws/**,**/id_rsa*,**/*.min.*,**/*.lock}";

const DEFAULT_MAX_FILES = 2_000;
// Skip very large files (generated bundles, data) that would bloat the index.
const MAX_FILE_BYTES = 200_000;

/** Where the workspace index is persisted, alongside the agent policy. */
function indexUri(root: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(root, ".codesetu", "index.json");
}

/**
 * Owns the `@workspace` semantic index for the active workspace: builds and
 * persists it, retrieves chunks for a chat turn, and exposes the agent's
 * `search_workspace` tool. Embeddings run against any OpenAI-compatible endpoint
 * so air-gapped setups can point at a local server.
 */
export class WorkspaceIndexManager {
  private index: WorkspaceIndex | undefined;

  public constructor(
    private readonly getApiKey: () => string | undefined,
    private readonly output: vscode.OutputChannel,
  ) {}

  private get root(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  private embeddingConfig(): { baseURL: string; model: string } {
    const cfg = vscode.workspace.getConfiguration("codesetu");
    const baseURL =
      trimmed(cfg.get<string>("workspaceIndex.embeddingBaseUrl")) ??
      trimmed(cfg.get<string>("baseUrl")) ??
      DEFAULT_EMBEDDING_BASE_URL;
    const model =
      trimmed(cfg.get<string>("workspaceIndex.embeddingModel")) ?? DEFAULT_EMBEDDING_MODEL;
    return { baseURL, model };
  }

  private provider(): OpenAIEmbeddingProvider {
    const { baseURL, model } = this.embeddingConfig();
    const apiKey = this.getApiKey();
    return new OpenAIEmbeddingProvider({ baseURL, model, ...(apiKey === undefined ? {} : { apiKey }) });
  }

  /** Load the persisted index from disk (or start empty) for the current model. */
  private async load(root: vscode.Uri): Promise<WorkspaceIndex> {
    const { model } = this.embeddingConfig();
    try {
      const bytes = await vscode.workspace.fs.readFile(indexUri(root));
      const data = JSON.parse(Buffer.from(bytes).toString("utf8")) as SerializedIndex;
      this.index = WorkspaceIndex.deserialize(data, model);
    } catch {
      this.index = new WorkspaceIndex(model);
    }
    return this.index;
  }

  private async save(root: vscode.Uri, index: WorkspaceIndex): Promise<void> {
    const bytes = Buffer.from(JSON.stringify(index.serialize()), "utf8");
    await vscode.workspace.fs.writeFile(indexUri(root), bytes);
  }

  /** (Re)build the index incrementally, reporting progress. Returns a summary. */
  public async reindex(progress?: (done: number, total: number) => void): Promise<string> {
    const root = this.root;
    if (root === undefined) {
      return "No workspace folder is open.";
    }
    const index = await this.load(root);
    const files = await this.collectFiles();
    if (files.length === 0) {
      return "No indexable files found in the workspace.";
    }
    const result = await updateWorkspaceIndex(index, this.provider(), files, {
      ...(progress === undefined ? {} : { onProgress: progress }),
    });
    await this.save(root, index);
    const summary = `Indexed ${result.indexed} file(s), skipped ${result.skipped} unchanged, removed ${result.removed}. ${index.chunkCount} chunks total.`;
    this.output.appendLine(`[index] ${summary}`);
    return summary;
  }

  /** True once an index with at least one chunk is available (loads from disk if needed). */
  public async isIndexed(): Promise<boolean> {
    return (await this.chunkCount()) > 0;
  }

  /** Number of chunks in the loaded index (loads from disk if needed); 0 if none. */
  public async chunkCount(): Promise<number> {
    const root = this.root;
    if (root === undefined) {
      return 0;
    }
    if (this.index === undefined) {
      await this.load(root);
    }
    return this.index?.chunkCount ?? 0;
  }

  /** Retrieve chunks for a chat turn, mapped to the IDE-context snippet shape. */
  public async retrieve(query: string, k: number): Promise<RetrievedSnippet[]> {
    const root = this.root;
    if (root === undefined) {
      return [];
    }
    if (this.index === undefined) {
      await this.load(root);
    }
    if (this.index === undefined || this.index.chunkCount === 0) {
      return [];
    }
    try {
      const hits = await retrieveFromWorkspace(this.index, this.provider(), query, { k });
      return hits.map((hit) => ({
        path: hit.path,
        startLine: hit.startLine,
        endLine: hit.endLine,
        text: hit.text,
      }));
    } catch (error) {
      this.output.appendLine(`[index] retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /** The agent's semantic-search tool, or undefined when no index is loaded. */
  public async searchTool(): Promise<AgentTool | undefined> {
    const root = this.root;
    if (root === undefined) {
      return undefined;
    }
    if (this.index === undefined) {
      await this.load(root);
    }
    if (this.index === undefined || this.index.chunkCount === 0) {
      return undefined;
    }
    return createSearchWorkspaceTool({ index: this.index, provider: this.provider() });
  }

  private async collectFiles(): Promise<WorkspaceFile[]> {
    const cfg = vscode.workspace.getConfiguration("codesetu");
    const maxFiles = cfg.get<number>("workspaceIndex.maxFiles", DEFAULT_MAX_FILES);
    const uris = await vscode.workspace.findFiles("**/*", EXCLUDE_GLOB, maxFiles);
    const files: WorkspaceFile[] = [];
    for (const uri of uris) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.size > MAX_FILE_BYTES) {
          continue;
        }
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString("utf8");
        // Skip files that look binary (a NUL byte in the first chunk).
        if (text.slice(0, 4096).includes("\u0000")) {
          continue;
        }
        files.push({ path: vscode.workspace.asRelativePath(uri, false), text });
      } catch {
        // Unreadable file — skip it.
      }
    }
    return files;
  }
}

/** True when the user's message opts into workspace retrieval via `@workspace`. */
export function mentionsWorkspace(text: string): boolean {
  return /(^|\s)@workspace\b/i.test(text);
}

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result === undefined || result.length === 0 ? undefined : result;
}
