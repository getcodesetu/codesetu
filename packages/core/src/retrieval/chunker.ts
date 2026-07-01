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

import type { CodeChunk } from "./types.js";

/** Lines per chunk before a new one starts. */
export const DEFAULT_CHUNK_MAX_LINES = 60;
/** Lines shared between consecutive chunks so a match near a boundary survives. */
export const DEFAULT_CHUNK_OVERLAP = 10;

export interface ChunkOptions {
  maxLines?: number;
  overlap?: number;
}

/**
 * Split a file into overlapping, line-aligned chunks. Line-based (not token- or
 * AST-based) keeps it language-agnostic and air-gapped-friendly, and the overlap
 * means a function straddling a boundary still lands wholly inside some chunk.
 * Whitespace-only files and whitespace-only chunks produce nothing.
 */
export function chunkFile(path: string, text: string, options: ChunkOptions = {}): CodeChunk[] {
  if (text.trim().length === 0) {
    return [];
  }
  const maxLines = Math.max(1, Math.floor(options.maxLines ?? DEFAULT_CHUNK_MAX_LINES));
  const overlap = Math.max(
    0,
    Math.min(Math.floor(options.overlap ?? DEFAULT_CHUNK_OVERLAP), maxLines - 1),
  );
  const step = maxLines - overlap;

  const lines = text.split("\n");
  const chunks: CodeChunk[] = [];
  for (let start = 0; start < lines.length; start += step) {
    const end = Math.min(start + maxLines, lines.length);
    const slice = lines.slice(start, end);
    if (slice.join("").trim().length > 0) {
      chunks.push({ path, startLine: start + 1, endLine: end, text: slice.join("\n") });
    }
    if (end >= lines.length) {
      break;
    }
  }
  return chunks;
}
