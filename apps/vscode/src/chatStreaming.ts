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

import type { ChatStreamChunk } from "@codesetu/core";

export interface ResolveAssistantResponseOptions {
  completeChat: () => Promise<string>;
  emptyMessage: string;
  onChunk?: (chunk: ChatStreamChunk) => void;
  onStreamFallback?: (reason: unknown) => void;
  streamChat: () => AsyncIterable<ChatStreamChunk>;
}

export async function resolveAssistantResponse(
  options: ResolveAssistantResponseOptions,
): Promise<string> {
  const onChunk = options.onChunk;
  if (onChunk === undefined) {
    return normalizeAssistantText(await options.completeChat(), options.emptyMessage);
  }

  let text = "";
  let bufferedText = "";
  let didEmitChunk = false;

  try {
    for await (const chunk of options.streamChat()) {
      // Reasoning (chain-of-thought) precedes/interleaves the answer — forward
      // it immediately so the "thinking" panel streams live.
      if (chunk.reasoning !== undefined && chunk.reasoning.length > 0) {
        onChunk({ reasoning: chunk.reasoning });
      }

      const content = chunk.content;
      if (content === undefined || content.length === 0) {
        continue;
      }

      // Only answer content counts toward the returned text. Buffer leading
      // whitespace so the rendered answer doesn't start with blank lines.
      text += content;

      if (didEmitChunk) {
        onChunk({ content });
        continue;
      }

      bufferedText += content;

      if (bufferedText.trim().length > 0) {
        onChunk({ content: bufferedText });
        bufferedText = "";
        didEmitChunk = true;
      }
    }

    if (text.trim().length === 0) {
      options.onStreamFallback?.(new Error("Streaming chat returned no text."));
      return normalizeAssistantText(await options.completeChat(), options.emptyMessage);
    }

    return normalizeAssistantText(text, options.emptyMessage);
  } catch (error: unknown) {
    if (text.length > 0) {
      throw error;
    }

    options.onStreamFallback?.(error);
    return normalizeAssistantText(await options.completeChat(), options.emptyMessage);
  }
}

function normalizeAssistantText(text: string, emptyMessage: string): string {
  const trimmed = text.trim();
  return trimmed.length === 0 ? emptyMessage : trimmed;
}
