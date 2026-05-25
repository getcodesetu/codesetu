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

export interface ResolveAssistantResponseOptions {
  completeChat: () => Promise<string>;
  emptyMessage: string;
  onChunk?: (chunk: string) => void;
  onStreamFallback?: (reason: unknown) => void;
  streamChat: () => AsyncIterable<string>;
}

export async function resolveAssistantResponse(
  options: ResolveAssistantResponseOptions,
): Promise<string> {
  if (options.onChunk === undefined) {
    return normalizeAssistantText(await options.completeChat(), options.emptyMessage);
  }

  let text = "";
  let bufferedText = "";
  let didEmitChunk = false;

  try {
    for await (const chunk of options.streamChat()) {
      if (chunk.length === 0) {
        continue;
      }

      text += chunk;

      if (didEmitChunk) {
        options.onChunk(chunk);
        continue;
      }

      bufferedText += chunk;

      if (bufferedText.trim().length > 0) {
        options.onChunk(bufferedText);
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
