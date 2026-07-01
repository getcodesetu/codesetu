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

export type {
  CodeChunk,
  IndexedChunk,
  RetrievedChunk,
  WorkspaceFile,
  EmbeddingProvider,
} from "./types.js";
export {
  chunkFile,
  DEFAULT_CHUNK_MAX_LINES,
  DEFAULT_CHUNK_OVERLAP,
  type ChunkOptions,
} from "./chunker.js";
export {
  cosineSimilarity,
  INDEX_FORMAT_VERSION,
  WorkspaceIndex,
  type SerializedIndex,
} from "./store.js";
export {
  DEFAULT_EMBED_BATCH_SIZE,
  hashContent,
  updateWorkspaceIndex,
  type IndexUpdateOptions,
  type IndexUpdateResult,
} from "./indexer.js";
export { DEFAULT_RETRIEVAL_K, retrieveFromWorkspace, type RetrievalOptions } from "./retriever.js";
export {
  DEFAULT_EMBEDDING_BASE_URL,
  DEFAULT_EMBEDDING_MODEL,
  OpenAIEmbeddingProvider,
  type EmbeddingClient,
  type OpenAIEmbeddingProviderOptions,
} from "./openaiEmbeddingProvider.js";
export { createSearchWorkspaceTool, type SearchWorkspaceToolOptions } from "./searchTool.js";
