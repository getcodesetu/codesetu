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
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type { Completion, CompletionCreateParamsNonStreaming } from "openai/resources/completions";

import type {
  ChatCompletionChunkStream,
  ChatCompletionRequest,
  ChatCompletionStream,
  ChatStreamChunk,
  FimCompletionRequest,
  LlmProvider,
} from "./base.js";

export const DEFAULT_OPENAI_COMPATIBLE_PROVIDER = "openai-compatible";
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "http://localhost:8000/v1";
export const DEFAULT_OPENAI_COMPATIBLE_MODEL = "local-code-model";

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface OpenAICompatibleClient {
  chat: {
    completions: {
      create(
        params: ChatCompletionCreateParamsNonStreaming,
        options?: RequestOptions,
      ): Promise<ChatCompletion>;
      create(
        params: ChatCompletionCreateParamsStreaming,
        options?: RequestOptions,
      ): Promise<ChatCompletionChunkStream>;
    };
  };
  completions: {
    create(params: CompletionCreateParamsNonStreaming): Promise<Completion>;
  };
}

export interface OpenAICompatibleProviderOptions {
  providerId?: string;
  apiKey?: string;
  apiKeyEnvVar?: string;
  baseURL?: string;
  baseURLEnvVar?: string;
  defaultBaseURL?: string;
  model?: string;
  modelEnvVar?: string;
  defaultModel?: string;
  client?: OpenAICompatibleClient;
}

type ChatCompletionReasoningEffort = "low" | "medium" | "high";
type ChatCompletionParams = Omit<ChatCompletionCreateParamsNonStreaming, "stream"> & {
  reasoning_effort?: ChatCompletionReasoningEffort;
};

export class OpenAICompatibleProvider implements LlmProvider {
  public readonly providerId: string;
  public readonly baseURL: string;
  public readonly model: string;

  private readonly client: OpenAICompatibleClient;
  private readonly apiKeyEnvVar: string;

  public constructor(options: OpenAICompatibleProviderOptions = {}) {
    this.providerId = options.providerId ?? DEFAULT_OPENAI_COMPATIBLE_PROVIDER;
    this.apiKeyEnvVar = options.apiKeyEnvVar ?? "CODESETU_API_KEY";
    this.baseURL =
      firstConfigValue(
        options.baseURL,
        options.baseURLEnvVar === undefined ? undefined : process.env[options.baseURLEnvVar],
        process.env.CODESETU_BASE_URL,
        options.defaultBaseURL,
        DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      ) ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
    this.model =
      firstConfigValue(
        options.model,
        options.modelEnvVar === undefined ? undefined : process.env[options.modelEnvVar],
        process.env.CODESETU_MODEL,
        options.defaultModel,
        DEFAULT_OPENAI_COMPATIBLE_MODEL,
      ) ?? DEFAULT_OPENAI_COMPATIBLE_MODEL;
    this.client = options.client ?? this.createClient(options.apiKey);
  }

  public chat(request: ChatCompletionRequest): Promise<ChatCompletion> {
    const params: ChatCompletionCreateParamsNonStreaming = this.buildChatParams(request);

    return this.client.chat.completions.create(params, requestOptions(request));
  }

  public async *streamChat(request: ChatCompletionRequest): ChatCompletionStream {
    const params: ChatCompletionCreateParamsStreaming = {
      ...this.buildChatParams(request),
      stream: true,
    };
    const stream = await this.client.chat.completions.create(params, requestOptions(request));

    for await (const chunk of stream) {
      const piece = readChunk(chunk);

      if (piece.content !== undefined || piece.reasoning !== undefined) {
        yield piece;
      }
    }
  }

  public completeFim(request: FimCompletionRequest): Promise<Completion> {
    const params: CompletionCreateParamsNonStreaming = {
      model: request.model ?? this.model,
      prompt: request.prompt,
      ...(request.suffix === undefined ? {} : { suffix: request.suffix }),
      ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.stop === undefined ? {} : { stop: request.stop }),
    };

    return this.client.completions.create(params);
  }

  private createClient(apiKeyOption: string | undefined): OpenAICompatibleClient {
    const apiKey = firstConfigValue(
      apiKeyOption,
      process.env[this.apiKeyEnvVar],
      process.env.CODESETU_API_KEY,
    );

    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error(
        `${this.apiKeyEnvVar} is required to create the ${this.providerId} provider.`,
      );
    }

    return new OpenAI({
      apiKey,
      baseURL: this.baseURL,
    });
  }

  private buildChatParams(request: ChatCompletionRequest): ChatCompletionParams {
    return {
      model: request.model ?? this.model,
      messages: request.messages,
      ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(this.providerId === "sarvam" ? { reasoning_effort: "low" as const } : {}),
      ...(request.tools === undefined ? {} : { tools: request.tools }),
      ...(request.toolChoice === undefined ? {} : { tool_choice: request.toolChoice }),
    };
  }
}

/**
 * Pull answer text and reasoning out of a streamed delta. Reasoning models
 * deliver chain-of-thought in a non-standard `reasoning_content` (some use
 * `reasoning`) field that the OpenAI SDK type doesn't declare, so we read it
 * defensively. Empty pieces are dropped by the caller.
 */
function readChunk(chunk: ChatCompletionChunk): ChatStreamChunk {
  const delta = chunk.choices[0]?.delta as
    | (ChatCompletionChunk["choices"][number]["delta"] & {
        reasoning_content?: unknown;
        reasoning?: unknown;
      })
    | undefined;

  const piece: ChatStreamChunk = {};

  if (typeof delta?.content === "string" && delta.content.length > 0) {
    piece.content = delta.content;
  } else if (typeof delta?.refusal === "string" && delta.refusal.length > 0) {
    piece.content = delta.refusal;
  }

  const reasoning = delta?.reasoning_content ?? delta?.reasoning;
  if (typeof reasoning === "string" && reasoning.length > 0) {
    piece.reasoning = reasoning;
  }

  return piece;
}

function requestOptions(request: ChatCompletionRequest): RequestOptions | undefined {
  return request.signal === undefined ? undefined : { signal: request.signal };
}

function firstConfigValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}
