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

import { getAssistantText, type ChatCompletion } from "@codesetu/core";

export interface CompleteAssistantTextOptions {
  complete: (maxTokens: number) => Promise<ChatCompletion>;
  emptyMessage: string;
  initialMaxTokens: number;
  onRetry?: (reason: string) => void;
  retryMaxTokens: number;
}

export async function completeAssistantText(
  options: CompleteAssistantTextOptions,
): Promise<string> {
  const completion = await options.complete(options.initialMaxTokens);
  const text = getAssistantText(completion).trim();

  if (text.length > 0) {
    return text;
  }

  if (!shouldRetryEmptyCompletion(completion, options.initialMaxTokens, options.retryMaxTokens)) {
    return options.emptyMessage;
  }

  options.onRetry?.("Provider returned empty text after reaching the token limit.");
  const retryCompletion = await options.complete(options.retryMaxTokens);
  const retryText = getAssistantText(retryCompletion).trim();

  return retryText.length === 0 ? options.emptyMessage : retryText;
}

function shouldRetryEmptyCompletion(
  completion: ChatCompletion,
  initialMaxTokens: number,
  retryMaxTokens: number,
): boolean {
  return retryMaxTokens > initialMaxTokens && completion.choices[0]?.finish_reason === "length";
}
