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
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type { Completion, CompletionCreateParamsNonStreaming } from "openai/resources/completions";

import {
  DEFAULT_HUGGINGFACE_BASE_URL,
  DEFAULT_HUGGINGFACE_MODEL,
  HuggingFaceProvider,
  type HuggingFaceOpenAIClient,
} from "../src/providers/huggingface.js";
import type { ChatStreamChunk } from "../src/providers/base.js";

const chatResponse: ChatCompletion = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 0,
  model: DEFAULT_HUGGINGFACE_MODEL,
  choices: [],
};

const fimResponse: Completion = {
  id: "cmpl-test",
  object: "text_completion",
  created: 0,
  model: DEFAULT_HUGGINGFACE_MODEL,
  choices: [],
};

function createMockClient(): {
  client: HuggingFaceOpenAIClient;
  chatCalls: Array<ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming>;
  completionCalls: CompletionCreateParamsNonStreaming[];
} {
  const chatCalls: Array<
    ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming
  > = [];
  const completionCalls: CompletionCreateParamsNonStreaming[] = [];

  const client: HuggingFaceOpenAIClient = {
    chat: {
      completions: {
        create: ((
          params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
        ) => {
          chatCalls.push(params);
          if (params.stream === true) {
            return Promise.resolve(toAsyncIterable([chatChunk("Hello"), chatChunk(" from HF")]));
          }
          return Promise.resolve(chatResponse);
        }) as HuggingFaceOpenAIClient["chat"]["completions"]["create"],
      },
    },
    completions: {
      create: (params) => {
        completionCalls.push(params);
        return Promise.resolve(fimResponse);
      },
    },
  };

  return { client, chatCalls, completionCalls };
}

async function* toAsyncIterable(chunks: ChatCompletionChunk[]): AsyncIterable<ChatCompletionChunk> {
  await Promise.resolve();

  for (const chunk of chunks) {
    yield chunk;
  }
}

function chatChunk(content: string): ChatCompletionChunk {
  return {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 0,
    model: DEFAULT_HUGGINGFACE_MODEL,
    choices: [
      {
        index: 0,
        delta: { content, role: "assistant" },
        finish_reason: null,
        logprobs: null,
      },
    ],
  };
}

describe("HuggingFaceProvider", () => {
  it("defaults to the Hugging Face router and a served chat model", () => {
    const { client } = createMockClient();
    const provider = new HuggingFaceProvider({ client });

    expect(provider.providerId).toBe("huggingface");
    expect(provider.baseURL).toBe(DEFAULT_HUGGINGFACE_BASE_URL);
    expect(provider.model).toBe(DEFAULT_HUGGINGFACE_MODEL);
  });

  it("targets a dedicated endpoint when given a base URL and model", () => {
    const { client } = createMockClient();
    const provider = new HuggingFaceProvider({
      client,
      baseURL: "https://abc123.endpoints.huggingface.cloud/v1",
      model: "Qwen/Qwen2.5-Coder-32B-Instruct",
    });

    expect(provider.baseURL).toBe("https://abc123.endpoints.huggingface.cloud/v1");
    expect(provider.model).toBe("Qwen/Qwen2.5-Coder-32B-Instruct");
  });

  it("requires a Hugging Face token when constructing the real client", () => {
    const originalToken = process.env.HF_TOKEN;
    const originalFallback = process.env.CODESETU_API_KEY;
    delete process.env.HF_TOKEN;
    delete process.env.CODESETU_API_KEY;

    try {
      expect(() => new HuggingFaceProvider()).toThrow("HF_TOKEN");
    } finally {
      restoreEnv("HF_TOKEN", originalToken);
      restoreEnv("CODESETU_API_KEY", originalFallback);
    }
  });

  it("does not send the Sarvam-only reasoning_effort field", async () => {
    const { client, chatCalls } = createMockClient();
    const provider = new HuggingFaceProvider({ client });

    await provider.chat({
      messages: [{ role: "user", content: "Hello there." }],
      maxTokens: 128,
      temperature: 0.2,
    });

    expect(chatCalls).toEqual([
      {
        model: DEFAULT_HUGGINGFACE_MODEL,
        messages: [{ role: "user", content: "Hello there." }],
        max_tokens: 128,
        temperature: 0.2,
      },
    ]);
    expect(chatCalls[0]).not.toHaveProperty("reasoning_effort");
  });

  it("streams chat completion text chunks", async () => {
    const { client } = createMockClient();
    const provider = new HuggingFaceProvider({ client });
    const chunks: ChatStreamChunk[] = [];

    for await (const chunk of provider.streamChat({
      messages: [{ role: "user", content: "Say hello." }],
      maxTokens: 64,
      temperature: 0.1,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([{ content: "Hello" }, { content: " from HF" }]);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
