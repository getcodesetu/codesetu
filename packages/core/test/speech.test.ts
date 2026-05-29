import { describe, expect, it, vi } from "vitest";

import {
  HuggingFaceSpeechProvider,
  OpenAICompatibleSpeechProvider,
  SarvamSpeechProvider,
  createSpeechProvider,
  normalizeSpeechProvider,
} from "../src/index.js";

const AUDIO = { mimeType: "audio/webm", bytes: new Uint8Array([1, 2, 3, 4]) };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("normalizeSpeechProvider", () => {
  it("accepts known providers", () => {
    expect(normalizeSpeechProvider("sarvam")).toBe("sarvam");
    expect(normalizeSpeechProvider("huggingface")).toBe("huggingface");
    expect(normalizeSpeechProvider("openai-compatible")).toBe("openai-compatible");
  });

  it("falls back to browser for unknown or empty values", () => {
    expect(normalizeSpeechProvider(undefined)).toBe("browser");
    expect(normalizeSpeechProvider("")).toBe("browser");
    expect(normalizeSpeechProvider("nonsense")).toBe("browser");
    // "local" was removed in v0.3 — should normalize to browser, not crash.
    expect(normalizeSpeechProvider("local")).toBe("browser");
  });
});

describe("createSpeechProvider", () => {
  it("returns null provider for browser (webview handles it)", () => {
    expect(createSpeechProvider({ provider: "browser" }).provider).toBeNull();
  });

  it("throws when a server-side provider is requested without an API key", () => {
    expect(() => createSpeechProvider({ provider: "sarvam" })).toThrow(/API key/i);
    expect(() => createSpeechProvider({ provider: "huggingface", apiKey: "" })).toThrow(/API key/i);
  });

  it("throws when openai-compatible is missing a baseURL", () => {
    expect(() => createSpeechProvider({ provider: "openai-compatible", apiKey: "k" })).toThrow(
      /base URL/i,
    );
  });

  it("builds a SarvamSpeechProvider when configured", () => {
    const result = createSpeechProvider({ provider: "sarvam", apiKey: "sk_test" });
    expect(result.providerId).toBe("sarvam");
    expect(result.provider).toBeInstanceOf(SarvamSpeechProvider);
  });

  it("builds a HuggingFaceSpeechProvider when configured", () => {
    const result = createSpeechProvider({ provider: "huggingface", apiKey: "hf_test" });
    expect(result.providerId).toBe("huggingface");
    expect(result.provider).toBeInstanceOf(HuggingFaceSpeechProvider);
  });

  it("builds an OpenAICompatibleSpeechProvider when given baseURL", () => {
    const result = createSpeechProvider({
      provider: "openai-compatible",
      apiKey: "sk_test",
      baseURL: "http://localhost:8000/v1",
    });
    expect(result.providerId).toBe("openai-compatible");
    expect(result.provider).toBeInstanceOf(OpenAICompatibleSpeechProvider);
  });
});

describe("SarvamSpeechProvider", () => {
  it("posts multipart to /speech-to-text and returns the transcript", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ transcript: "नमस्ते दुनिया", language_code: "hi-IN" }));
    const provider = new SarvamSpeechProvider({
      apiKey: "sk_test",
      baseURL: "https://api.sarvam.ai",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.transcribe(AUDIO, { language: "hi-IN" });
    expect(result.text).toBe("नमस्ते दुनिया");
    expect(result.language).toBe("hi-IN");

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://api.sarvam.ai/speech-to-text");
    const init = call?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-subscription-key"]).toBe("sk_test");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("throws when the API returns a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 }));
    const provider = new SarvamSpeechProvider({
      apiKey: "sk_test",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(provider.transcribe(AUDIO)).rejects.toThrow(/403/);
  });
});

describe("OpenAICompatibleSpeechProvider", () => {
  it("posts multipart to /audio/transcriptions and returns text + language", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ text: "hello world", language: "english" }));
    const provider = new OpenAICompatibleSpeechProvider({
      apiKey: "sk_test",
      baseURL: "https://api.openai.com/v1",
      fetch: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.transcribe(AUDIO, { language: "en-US" });
    expect(result.text).toBe("hello world");
    expect(result.language).toBe("english");

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("https://api.openai.com/v1/audio/transcriptions");
    const init = call?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test");
  });
});

describe("HuggingFaceSpeechProvider", () => {
  it("inherits the OpenAI-compatible transport with HF defaults", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: "hi" }));
    const provider = new HuggingFaceSpeechProvider({
      apiKey: "hf_test",
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(provider.id).toBe("huggingface");

    await provider.transcribe(AUDIO);
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("https://router.huggingface.co/v1/audio/transcriptions");
  });
});
