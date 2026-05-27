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
import type { ChatCompletion } from "openai/resources/chat/completions";

import {
  DEFAULT_HUGGINGFACE_BASE_URL,
  DEFAULT_HUGGINGFACE_MODEL,
  DEFAULT_OPENAI_COMPATIBLE_PROVIDER,
  DEFAULT_SARVAM_BASE_URL,
  DEFAULT_SARVAM_MODEL,
  HuggingFaceProvider,
  OpenAICompatibleProvider,
  SarvamProvider,
  createProvider,
  getAssistantText,
  listProviderIds,
  type ProviderId,
} from "../src/index.js";

const assistantResponse: ChatCompletion = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 0,
  model: DEFAULT_SARVAM_MODEL,
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      logprobs: null,
      message: {
        role: "assistant",
        content: "Namaste from CodeSetu",
        refusal: null,
      },
    },
  ],
};

describe("provider factory", () => {
  it("lists built-in provider ids", () => {
    expect(listProviderIds()).toEqual(["sarvam", "openai-compatible", "huggingface"]);
  });

  it("creates Sarvam by default", () => {
    const provider = createProvider({ apiKey: "test-key" });

    expect(provider).toBeInstanceOf(SarvamProvider);
    expect(provider.model).toBe(DEFAULT_SARVAM_MODEL);
    expect(provider.baseURL).toBe(DEFAULT_SARVAM_BASE_URL);
  });

  it("creates a generic OpenAI-compatible provider", () => {
    const provider = createProvider({
      provider: "openai-compatible",
      apiKey: "test-key",
      baseURL: "http://localhost:8000/v1",
      model: "local-code-model",
    });

    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.providerId).toBe(DEFAULT_OPENAI_COMPATIBLE_PROVIDER);
    expect(provider.model).toBe("local-code-model");
    expect(provider.baseURL).toBe("http://localhost:8000/v1");
  });

  it("creates a Hugging Face provider with router defaults", () => {
    const provider = createProvider({ provider: "huggingface", apiKey: "hf_test-token" });

    expect(provider).toBeInstanceOf(HuggingFaceProvider);
    expect(provider.providerId).toBe("huggingface");
    expect(provider.baseURL).toBe(DEFAULT_HUGGINGFACE_BASE_URL);
    expect(provider.model).toBe(DEFAULT_HUGGINGFACE_MODEL);
  });

  it("lets a Hugging Face provider target a dedicated endpoint and model", () => {
    const provider = createProvider({
      provider: "huggingface",
      apiKey: "hf_test-token",
      baseURL: "https://abc123.endpoints.huggingface.cloud/v1",
      model: "Qwen/Qwen2.5-Coder-32B-Instruct",
    });

    expect(provider).toBeInstanceOf(HuggingFaceProvider);
    expect(provider.baseURL).toBe("https://abc123.endpoints.huggingface.cloud/v1");
    expect(provider.model).toBe("Qwen/Qwen2.5-Coder-32B-Instruct");
  });

  it("rejects unknown providers", () => {
    expect(() =>
      createProvider({
        provider: "unknown-provider" as ProviderId,
        apiKey: "test-key",
      }),
    ).toThrow("Unsupported provider");
  });
});

describe("getAssistantText", () => {
  it("returns the first assistant text response", () => {
    expect(getAssistantText(assistantResponse)).toBe("Namaste from CodeSetu");
  });

  it("returns an empty string when the response has no text", () => {
    expect(getAssistantText({ ...assistantResponse, choices: [] })).toBe("");
  });

  it("returns refusal text when the provider omits assistant content", () => {
    expect(
      getAssistantText({
        ...assistantResponse,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            logprobs: null,
            message: {
              role: "assistant",
              content: null,
              refusal: "I cannot inspect secret values.",
            },
          },
        ],
      }),
    ).toBe("I cannot inspect secret values.");
  });
});
