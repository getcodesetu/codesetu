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

import type { ChatCompletion } from "openai/resources/chat/completions";
import { describe, expect, it } from "vitest";

import { completeAssistantText } from "../src/chatCompletionRetry";

describe("completeAssistantText", () => {
  it("returns assistant text from the first completion", async () => {
    const calls: number[] = [];

    const text = await completeAssistantText({
      complete: async (maxTokens) => {
        calls.push(maxTokens);
        return completion("Hello");
      },
      emptyMessage: "CodeSetu did not return any text.",
      initialMaxTokens: 1024,
      retryMaxTokens: 4096,
    });

    expect(text).toBe("Hello");
    expect(calls).toEqual([1024]);
  });

  it("retries with a larger token budget when the provider returns empty text after hitting length", async () => {
    const calls: number[] = [];

    const text = await completeAssistantText({
      complete: async (maxTokens) => {
        calls.push(maxTokens);
        return calls.length === 1 ? emptyLengthCompletion() : completion("ok");
      },
      emptyMessage: "CodeSetu did not return any text.",
      initialMaxTokens: 1024,
      retryMaxTokens: 4096,
    });

    expect(text).toBe("ok");
    expect(calls).toEqual([1024, 4096]);
  });
});

function completion(content: string): ChatCompletion {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "sarvam-30b",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        logprobs: null,
        message: {
          role: "assistant",
          content,
          refusal: null,
        },
      },
    ],
  };
}

function emptyLengthCompletion(): ChatCompletion {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "sarvam-30b",
    choices: [
      {
        index: 0,
        finish_reason: "length",
        logprobs: null,
        message: {
          role: "assistant",
          content: null,
          refusal: null,
        },
      },
    ],
  };
}
