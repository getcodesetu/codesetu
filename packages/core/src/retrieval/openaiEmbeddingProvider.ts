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

import OpenAI from "openai";

import type { EmbeddingProvider } from "./types.js";

// Local-first defaults that match the JetBrains plugin and the on-prem Docker
// stack (Ollama). text-embedding-3-small is OpenAI-only and 404s on a local
// server, so it's a poor default for CodeSetu's bring-your-own-model setup.
export const DEFAULT_EMBEDDING_BASE_URL = "http://localhost:11434/v1";
export const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";

/** The slice of the OpenAI embeddings API this provider uses; injectable for tests. */
export interface EmbeddingClient {
  embeddings: {
    create(params: { model: string; input: string[] }): Promise<{ data: Array<{ embedding: number[] }> }>;
  };
}

export interface OpenAIEmbeddingProviderOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  client?: EmbeddingClient;
}

/**
 * Embeddings against any OpenAI-compatible `/v1/embeddings` endpoint — the same
 * bring-your-own-model story as chat, so embeddings can run on Ollama, vLLM,
 * TGI, or a hosted API. Keeps embedding config independent of chat config.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  public readonly baseURL: string;
  public readonly model: string;
  private readonly client: EmbeddingClient;

  public constructor(options: OpenAIEmbeddingProviderOptions = {}) {
    this.baseURL = firstValue(
      options.baseURL,
      process.env.CODESETU_EMBEDDING_BASE_URL,
      process.env.CODESETU_BASE_URL,
      DEFAULT_EMBEDDING_BASE_URL,
    )!;
    this.model = firstValue(
      options.model,
      process.env.CODESETU_EMBEDDING_MODEL,
      DEFAULT_EMBEDDING_MODEL,
    )!;
    this.client = options.client ?? this.createClient(options.apiKey);
  }

  public async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const response = await this.client.embeddings.create({ model: this.model, input: texts });
    return response.data.map((entry) => entry.embedding);
  }

  private createClient(apiKeyOption: string | undefined): EmbeddingClient {
    const apiKey = firstValue(
      apiKeyOption,
      process.env.CODESETU_EMBEDDING_API_KEY,
      process.env.CODESETU_API_KEY,
      // Local servers (Ollama/vLLM) usually ignore the key; send a placeholder
      // so the SDK doesn't refuse to construct.
      "local",
    )!;
    return new OpenAI({ apiKey, baseURL: this.baseURL }) as unknown as EmbeddingClient;
  }
}

function firstValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}
