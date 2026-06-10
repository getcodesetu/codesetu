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

import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { Completion } from "openai/resources/completions";

export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
};

export type ChatMessage = ChatCompletionMessageParam;

/**
 * A streamed piece of a chat completion. Reasoning models emit their
 * chain-of-thought separately from the answer; we surface both so the UI can
 * show a "thinking" panel. A chunk carries `content` (answer text), `reasoning`
 * (thinking text), or — rarely — neither (skipped by the provider).
 */
export interface ChatStreamChunk {
  content?: string;
  reasoning?: string;
}

export type ChatCompletionStream = AsyncIterable<ChatStreamChunk>;
export type ChatCompletionChunkStream = AsyncIterable<ChatCompletionChunk>;

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ChatCompletionTool[];
  toolChoice?: ChatCompletionCreateParamsNonStreaming["tool_choice"];
  /** Abort the in-flight HTTP request (e.g. when the user hits Stop). */
  signal?: AbortSignal;
}

export interface FimCompletionRequest {
  prompt: string;
  suffix?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string | string[];
}

export interface LlmProvider {
  chat(request: ChatCompletionRequest): Promise<ChatCompletion>;
  streamChat(request: ChatCompletionRequest): ChatCompletionStream;
  completeFim(request: FimCompletionRequest): Promise<Completion>;
}
