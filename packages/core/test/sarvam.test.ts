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
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { Completion, CompletionCreateParamsNonStreaming } from "openai/resources/completions";

import {
  DEFAULT_SARVAM_BASE_URL,
  DEFAULT_SARVAM_MODEL,
  SarvamProvider,
  type SarvamOpenAIClient,
} from "../src/providers/sarvam.js";

const chatResponse: ChatCompletion = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 0,
  model: DEFAULT_SARVAM_MODEL,
  choices: [],
};

const fimResponse: Completion = {
  id: "cmpl-test",
  object: "text_completion",
  created: 0,
  model: DEFAULT_SARVAM_MODEL,
  choices: [],
};

function createMockClient(): {
  client: SarvamOpenAIClient;
  chatCalls: ChatCompletionCreateParamsNonStreaming[];
  completionCalls: CompletionCreateParamsNonStreaming[];
} {
  const chatCalls: ChatCompletionCreateParamsNonStreaming[] = [];
  const completionCalls: CompletionCreateParamsNonStreaming[] = [];

  const client: SarvamOpenAIClient = {
    chat: {
      completions: {
        create: (params) => {
          chatCalls.push(params);
          return Promise.resolve(chatResponse);
        },
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

describe("SarvamProvider", () => {
  it("defaults to the current standard Sarvam chat model", () => {
    expect(DEFAULT_SARVAM_MODEL).toBe("sarvam-30b");
  });

  it("uses Sarvam defaults", () => {
    const { client } = createMockClient();
    const provider = new SarvamProvider({ client });

    expect(provider.baseURL).toBe(DEFAULT_SARVAM_BASE_URL);
    expect(provider.model).toBe(DEFAULT_SARVAM_MODEL);
  });

  it("ignores blank environment values when resolving defaults", () => {
    const originalModel = process.env.SARVAM_MODEL;
    process.env.SARVAM_MODEL = "";

    try {
      const { client } = createMockClient();
      const provider = new SarvamProvider({ client });

      expect(provider.model).toBe(DEFAULT_SARVAM_MODEL);
    } finally {
      if (originalModel === undefined) {
        delete process.env.SARVAM_MODEL;
      } else {
        process.env.SARVAM_MODEL = originalModel;
      }
    }
  });

  it("requires an API key when constructing the real OpenAI-compatible client", () => {
    const originalApiKey = process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_API_KEY;

    try {
      expect(() => new SarvamProvider()).toThrow("SARVAM_API_KEY");
    } finally {
      if (originalApiKey === undefined) {
        delete process.env.SARVAM_API_KEY;
      } else {
        process.env.SARVAM_API_KEY = originalApiKey;
      }
    }
  });

  it("sends chat completions with tool calling fields", async () => {
    const { client, chatCalls } = createMockClient();
    const provider = new SarvamProvider({ client });
    const tools: ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "lookup_abdm_profile",
          description: "Look up a sample ABDM profile.",
          parameters: {
            type: "object",
            properties: {
              healthId: {
                type: "string",
              },
            },
            required: ["healthId"],
          },
        },
      },
    ];

    await provider.chat({
      messages: [{ role: "user", content: "Find the profile for health ID 123." }],
      maxTokens: 128,
      temperature: 0.2,
      tools,
      toolChoice: "auto",
    });

    expect(chatCalls).toEqual([
      {
        model: DEFAULT_SARVAM_MODEL,
        messages: [{ role: "user", content: "Find the profile for health ID 123." }],
        max_tokens: 128,
        temperature: 0.2,
        tools,
        tool_choice: "auto",
      },
    ]);
  });

  it("sends FIM requests through the completions endpoint", async () => {
    const { client, completionCalls } = createMockClient();
    const provider = new SarvamProvider({ client, model: "sarvam-30b-code" });

    await provider.completeFim({
      prompt: "function greet(name: string) {\n  return ",
      suffix: ";\n}\n",
      maxTokens: 32,
      temperature: 0,
      stop: ["\n\n"],
    });

    expect(completionCalls).toEqual([
      {
        model: "sarvam-30b-code",
        prompt: "function greet(name: string) {\n  return ",
        suffix: ";\n}\n",
        max_tokens: 32,
        temperature: 0,
        stop: ["\n\n"],
      },
    ]);
  });
});
