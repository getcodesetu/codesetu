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

/** A contiguous slice of one file, the unit that gets embedded and retrieved. */
export interface CodeChunk {
  path: string;
  /** 1-based, inclusive. */
  startLine: number;
  /** 1-based, inclusive. */
  endLine: number;
  text: string;
}

/** A {@link CodeChunk} with its embedding and a stable id, stored in the index. */
export interface IndexedChunk extends CodeChunk {
  id: string;
  vector: number[];
}

/** A retrieval hit — a chunk plus its similarity to the query (higher is closer). */
export interface RetrievedChunk extends CodeChunk {
  score: number;
}

/** One workspace file presented to the indexer. */
export interface WorkspaceFile {
  path: string;
  text: string;
}

/**
 * Turns text into embedding vectors. Deliberately minimal and separate from the
 * chat {@link LlmProvider} so an air-gapped deployment can point embeddings at a
 * different OpenAI-compatible endpoint (or model) than chat.
 */
export interface EmbeddingProvider {
  /** Embed a batch of texts; returns one vector per input, in input order. */
  embed(texts: string[]): Promise<number[][]>;
}
