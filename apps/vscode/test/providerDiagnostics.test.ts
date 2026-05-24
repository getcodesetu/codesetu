/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, expect, it } from "vitest";

import {
  formatChatProviderLine,
  formatProviderDiagnosticLines,
} from "../src/providerDiagnostics.js";

describe("formatProviderDiagnosticLines", () => {
  it("renders safe provider metadata and diagnostic status", () => {
    expect(
      formatProviderDiagnosticLines(
        {
          provider: "openai-compatible",
          baseURL: "http://localhost:11434/v1",
          model: "qwen2.5-coder:7b",
          hasApiKey: true,
        },
        {
          status: "ok",
          provider: "openai-compatible",
          baseURL: "http://localhost:11434/v1",
          model: "qwen2.5-coder:7b",
          hasApiKey: true,
          latencyMs: 42,
          message: "Provider diagnostic chat completed.",
        },
      ),
    ).toEqual([
      "Provider: openai-compatible",
      "Base URL: http://localhost:11434/v1",
      "Model: qwen2.5-coder:7b",
      "API key configured: yes",
      "Diagnostic: ok - Provider diagnostic chat completed.",
      "Latency: 42ms",
    ]);
  });

  it("formats chat provider metadata without leaking secrets", () => {
    expect(
      formatChatProviderLine({
        provider: "sarvam",
        baseURL: "https://api.sarvam.ai/v1",
        model: "sarvam-30b",
        hasApiKey: true,
      }),
    ).toBe(
      "Chat request provider: sarvam; baseURL=https://api.sarvam.ai/v1; model=sarvam-30b; apiKeyConfigured=yes",
    );
  });
});
