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

import { chunkFile, type ChunkOptions } from "./chunker.js";
import type { WorkspaceIndex } from "./store.js";
import type { CodeChunk, EmbeddingProvider, IndexedChunk, WorkspaceFile } from "./types.js";

/** How many chunk texts to send per embedding request. */
export const DEFAULT_EMBED_BATCH_SIZE = 64;

export interface IndexUpdateOptions extends ChunkOptions {
  batchSize?: number;
  /** Invoked as files are embedded, for progress reporting. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface IndexUpdateResult {
  /** Files that were (re)chunked and embedded this run. */
  indexed: number;
  /** Files skipped because their content hash was unchanged. */
  skipped: number;
  /** Files dropped because they no longer exist in the workspace. */
  removed: number;
}

/**
 * Fast, stable, non-cryptographic content hash (FNV-1a, 32-bit) used only to
 * detect whether a file changed since it was last indexed. No crypto dependency,
 * so the indexer stays portable across host environments.
 */
export function hashContent(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Bring `index` in line with `files`: skip unchanged files, (re)chunk and embed
 * changed/new ones, and drop files that have disappeared. Embedding is batched
 * and incremental, so steady-state re-index after editing one file is cheap.
 */
export async function updateWorkspaceIndex(
  index: WorkspaceIndex,
  provider: EmbeddingProvider,
  files: readonly WorkspaceFile[],
  options: IndexUpdateOptions = {},
): Promise<IndexUpdateResult> {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_EMBED_BATCH_SIZE);
  const present = new Set(files.map((file) => file.path));

  let removed = 0;
  for (const path of index.paths()) {
    if (!present.has(path)) {
      index.removeFile(path);
      removed += 1;
    }
  }

  // Collect every chunk that needs (re)embedding across all changed files, so a
  // single small file doesn't waste a whole embedding round-trip.
  const pending: Array<{ path: string; hash: string; chunks: CodeChunk[] }> = [];
  let skipped = 0;
  for (const file of files) {
    const hash = hashContent(file.text);
    if (index.hasUnchanged(file.path, hash)) {
      skipped += 1;
      continue;
    }
    const chunks = chunkFile(file.path, file.text, options);
    if (chunks.length === 0) {
      // Empty/whitespace file: record the hash so it's not re-chunked next run.
      index.upsertFile(file.path, hash, []);
      continue;
    }
    pending.push({ path: file.path, hash, chunks });
  }

  const flatChunks = pending.flatMap((entry) => entry.chunks);
  const vectors = await embedAll(provider, flatChunks, batchSize, options);

  // Stitch the flat vector list back onto each file's chunks, in order.
  let cursor = 0;
  let indexed = 0;
  for (const entry of pending) {
    const indexedChunks: IndexedChunk[] = entry.chunks.map((chunk) => ({
      ...chunk,
      id: `${chunk.path}:${chunk.startLine}-${chunk.endLine}`,
      vector: vectors[cursor++]!,
    }));
    index.upsertFile(entry.path, entry.hash, indexedChunks);
    indexed += 1;
  }

  return { indexed, skipped, removed };
}

async function embedAll(
  provider: EmbeddingProvider,
  chunks: readonly CodeChunk[],
  batchSize: number,
  options: IndexUpdateOptions,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < chunks.length; start += batchSize) {
    if (options.signal?.aborted === true) {
      throw new Error("Indexing was cancelled.");
    }
    const batch = chunks.slice(start, start + batchSize);
    const embedded = await provider.embed(batch.map((chunk) => chunk.text));
    vectors.push(...embedded);
    options.onProgress?.(Math.min(start + batch.length, chunks.length), chunks.length);
  }
  return vectors;
}
