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

import type { WorkspaceIndex } from "./store.js";
import type { EmbeddingProvider, RetrievedChunk } from "./types.js";

/** Default number of chunks to pull back for a query. */
export const DEFAULT_RETRIEVAL_K = 8;

export interface RetrievalOptions {
  k?: number;
  /** Drop hits below this cosine score (cosine is in [-1, 1]). */
  minScore?: number;
}

/**
 * Embed `query` and return the most semantically similar chunks in the index.
 * Returns nothing for a blank query or an empty index — callers can treat an
 * empty result as "no semantic context available" and fall back to grep/glob.
 */
export async function retrieveFromWorkspace(
  index: WorkspaceIndex,
  provider: EmbeddingProvider,
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievedChunk[]> {
  if (query.trim().length === 0 || index.chunkCount === 0) {
    return [];
  }
  const k = Math.max(1, options.k ?? DEFAULT_RETRIEVAL_K);
  const [queryVector] = await provider.embed([query]);
  if (queryVector === undefined) {
    return [];
  }
  const hits = index.search(queryVector, k);
  if (options.minScore === undefined) {
    return hits;
  }
  return hits.filter((hit) => hit.score >= options.minScore!);
}
