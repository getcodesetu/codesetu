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
  FimCompletionRequest,
  LlmProvider,
} from "./base.js";

export const DEFAULT_OPENAI_COMPATIBLE_PROVIDER = "openai-compatible";
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "http://localhost:8000/v1";
export const DEFAULT_OPENAI_COMPATIBLE_MODEL = "local-code-model";

export interface OpenAICompatibleClient {
  chat: {
    completions: {
      create(params: ChatCompletionCreateParamsNonStreaming): Promise<ChatCompletion>;
      create(params: ChatCompletionCreateParamsStreaming): Promise<ChatCompletionChunkStream>;
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

    return this.client.chat.completions.create(params);
  }

  public async *streamChat(request: ChatCompletionRequest): ChatCompletionStream {
    const params: ChatCompletionCreateParamsStreaming = {
      ...this.buildChatParams(request),
      stream: true,
    };
    const stream = await this.client.chat.completions.create(params);

    for await (const chunk of stream) {
      const text = getTextFromChunk(chunk);

      if (text.length > 0) {
        yield text;
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

  private buildChatParams(
    request: ChatCompletionRequest,
  ): Omit<ChatCompletionCreateParamsNonStreaming, "stream"> {
    return {
      model: request.model ?? this.model,
      messages: request.messages,
      ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.tools === undefined ? {} : { tools: request.tools }),
      ...(request.toolChoice === undefined ? {} : { tool_choice: request.toolChoice }),
    };
  }
}

function getTextFromChunk(chunk: ChatCompletionChunk): string {
  const delta = chunk.choices[0]?.delta;
  const content = delta?.content;

  if (typeof content === "string") {
    return content;
  }

  if (typeof delta?.refusal === "string") {
    return delta.refusal;
  }

  return "";
}

function firstConfigValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}
