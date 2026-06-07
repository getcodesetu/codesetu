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
import { describe, expect, it } from "vitest";

import { resolveAssistantResponse } from "../src/chatStreaming";

describe("resolveAssistantResponse", () => {
  it("streams assistant content chunks when a chunk callback is provided", async () => {
    const content: string[] = [];

    const response = await resolveAssistantResponse({
      completeChat: async () => {
        throw new Error("completeChat should not be called while streaming");
      },
      emptyMessage: "CodeSetu did not return any text.",
      onChunk: (chunk) => {
        if (chunk.content !== undefined) content.push(chunk.content);
      },
      streamChat: () => toAsyncIterable([{ content: "Hello" }, { content: " from CodeSetu" }]),
    });

    expect(response).toBe("Hello from CodeSetu");
    expect(content).toEqual(["Hello", " from CodeSetu"]);
  });

  it("forwards reasoning separately and keeps it out of the returned answer", async () => {
    const content: string[] = [];
    const reasoning: string[] = [];

    const response = await resolveAssistantResponse({
      completeChat: async () => {
        throw new Error("completeChat should not be called while streaming");
      },
      emptyMessage: "CodeSetu did not return any text.",
      onChunk: (chunk) => {
        if (chunk.reasoning !== undefined) reasoning.push(chunk.reasoning);
        if (chunk.content !== undefined) content.push(chunk.content);
      },
      streamChat: () =>
        toAsyncIterable([{ reasoning: "Let me think." }, { content: "The answer." }]),
    });

    expect(response).toBe("The answer.");
    expect(reasoning).toEqual(["Let me think."]);
    expect(content).toEqual(["The answer."]);
  });

  it("uses the non-streaming completion when no chunk callback is provided", async () => {
    const response = await resolveAssistantResponse({
      completeChat: async () => "Full response",
      emptyMessage: "CodeSetu did not return any text.",
      streamChat: () => toAsyncIterable([{ content: "Streaming response" }]),
    });

    expect(response).toBe("Full response");
  });

  it("falls back to a non-streaming completion when streaming fails before text arrives", async () => {
    const chunks: ChatStreamChunk[] = [];

    const response = await resolveAssistantResponse({
      completeChat: async () => "Fallback response",
      emptyMessage: "CodeSetu did not return any text.",
      onChunk: (chunk) => chunks.push(chunk),
      streamChat: () => failingStream(),
    });

    expect(response).toBe("Fallback response");
    expect(chunks).toEqual([]);
  });

  it("falls back to a non-streaming completion when streaming returns no text", async () => {
    const chunks: ChatStreamChunk[] = [];

    const response = await resolveAssistantResponse({
      completeChat: async () => "Fallback response",
      emptyMessage: "CodeSetu did not return any text.",
      onChunk: (chunk) => chunks.push(chunk),
      streamChat: () => toAsyncIterable([]),
    });

    expect(response).toBe("Fallback response");
    expect(chunks).toEqual([]);
  });

  it("does not open a streaming message for whitespace-only content chunks", async () => {
    const chunks: ChatStreamChunk[] = [];

    const response = await resolveAssistantResponse({
      completeChat: async () => "Fallback response",
      emptyMessage: "CodeSetu did not return any text.",
      onChunk: (chunk) => chunks.push(chunk),
      streamChat: () => toAsyncIterable([{ content: " " }, { content: "\n" }]),
    });

    expect(response).toBe("Fallback response");
    expect(chunks).toEqual([]);
  });
});

async function* toAsyncIterable(
  chunks: readonly ChatStreamChunk[],
): AsyncIterable<ChatStreamChunk> {
  await Promise.resolve();

  for (const chunk of chunks) {
    yield chunk;
  }
}

async function* failingStream(): AsyncIterable<ChatStreamChunk> {
  await Promise.resolve();
  throw new Error("stream failed");
}
