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

import type { IndexedChunk, RetrievedChunk } from "./types.js";

/** Bumped when the on-disk shape changes so a stale index is rebuilt, not misread. */
export const INDEX_FORMAT_VERSION = 1;

/** The serializable form of a {@link WorkspaceIndex} — safe to JSON.stringify. */
export interface SerializedIndex {
  version: number;
  /** Embedding model the vectors were produced with; a mismatch forces a rebuild. */
  model: string;
  /** Per-file content hash, so an unchanged file is skipped on re-index. */
  files: Record<string, string>;
  chunks: IndexedChunk[];
}

/** Cosine similarity of two equal-length vectors; 0 if either has no magnitude. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * An in-memory vector store keyed by file, with file content hashes for
 * incremental re-index and JSON (de)serialization for on-disk persistence.
 * Search is a brute-force cosine scan — fine for a single repo, and it keeps the
 * store dependency-free and air-gapped-friendly.
 */
export class WorkspaceIndex {
  private readonly hashes = new Map<string, string>();
  private readonly chunksByPath = new Map<string, IndexedChunk[]>();

  public constructor(public readonly model: string) {}

  /** True if the file is already indexed at this exact content hash. */
  public hasUnchanged(path: string, hash: string): boolean {
    return this.hashes.get(path) === hash;
  }

  /** Replace all chunks for a file (used after (re)chunking + embedding it). */
  public upsertFile(path: string, hash: string, chunks: IndexedChunk[]): void {
    this.hashes.set(path, hash);
    this.chunksByPath.set(path, chunks);
  }

  /** Drop a file from the index (e.g. it was deleted from the workspace). */
  public removeFile(path: string): void {
    this.hashes.delete(path);
    this.chunksByPath.delete(path);
  }

  public paths(): string[] {
    return [...this.hashes.keys()];
  }

  public get chunkCount(): number {
    let total = 0;
    for (const chunks of this.chunksByPath.values()) {
      total += chunks.length;
    }
    return total;
  }

  /** The `k` chunks most similar to `queryVector`, highest score first. */
  public search(queryVector: readonly number[], k = 8): RetrievedChunk[] {
    const scored: RetrievedChunk[] = [];
    for (const chunks of this.chunksByPath.values()) {
      for (const chunk of chunks) {
        scored.push({
          path: chunk.path,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          text: chunk.text,
          score: cosineSimilarity(queryVector, chunk.vector),
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(0, k));
  }

  public serialize(): SerializedIndex {
    const files: Record<string, string> = {};
    for (const [path, hash] of this.hashes) {
      files[path] = hash;
    }
    const chunks: IndexedChunk[] = [];
    for (const fileChunks of this.chunksByPath.values()) {
      chunks.push(...fileChunks);
    }
    return { version: INDEX_FORMAT_VERSION, model: this.model, files, chunks };
  }

  /**
   * Rebuild an index from its serialized form. Returns an empty index for the
   * given model when the data is absent, the wrong version, or a model mismatch
   * — a caller can then re-index from scratch rather than trust stale vectors.
   */
  public static deserialize(data: SerializedIndex | undefined, model: string): WorkspaceIndex {
    const index = new WorkspaceIndex(model);
    if (data === undefined || data.version !== INDEX_FORMAT_VERSION || data.model !== model) {
      return index;
    }
    const byPath = new Map<string, IndexedChunk[]>();
    for (const chunk of data.chunks) {
      const bucket = byPath.get(chunk.path) ?? [];
      bucket.push(chunk);
      byPath.set(chunk.path, bucket);
    }
    for (const [path, hash] of Object.entries(data.files)) {
      index.upsertFile(path, hash, byPath.get(path) ?? []);
    }
    return index;
  }
}
