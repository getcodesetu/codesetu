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

import { describe, expect, it } from "vitest";

import { resolveAssistantResponse } from "../src/chatStreaming";

describe("resolveAssistantResponse", () => {
  it("streams assistant chunks when a chunk callback is provided", async () => {
    const chunks: string[] = [];

    const response = await resolveAssistantResponse({
      completeChat: async () => {
        throw new Error("completeChat should not be called while streaming");
      },
      emptyMessage: "CodeSetu did not return any text.",
      onChunk: (chunk) => chunks.push(chunk),
      streamChat: () => toAsyncIterable(["Hello", " from CodeSetu"]),
    });

    expect(response).toBe("Hello from CodeSetu");
    expect(chunks).toEqual(["Hello", " from CodeSetu"]);
  });

  it("uses the non-streaming completion when no chunk callback is provided", async () => {
    const response = await resolveAssistantResponse({
      completeChat: async () => "Full response",
      emptyMessage: "CodeSetu did not return any text.",
      streamChat: () => toAsyncIterable(["Streaming response"]),
    });

    expect(response).toBe("Full response");
  });

  it("falls back to a non-streaming completion when streaming fails before text arrives", async () => {
    const chunks: string[] = [];

    const response = await resolveAssistantResponse({
      completeChat: async () => "Fallback response",
      emptyMessage: "CodeSetu did not return any text.",
      onChunk: (chunk) => chunks.push(chunk),
      streamChat: () => failingStream(),
    });

    expect(response).toBe("Fallback response");
    expect(chunks).toEqual([]);
  });
});

async function* toAsyncIterable(chunks: readonly string[]): AsyncIterable<string> {
  await Promise.resolve();

  for (const chunk of chunks) {
    yield chunk;
  }
}

async function* failingStream(): AsyncIterable<string> {
  await Promise.resolve();
  throw new Error("stream failed");
}
