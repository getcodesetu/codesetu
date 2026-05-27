import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildActionUserMessage,
  buildCodeSetuSystemMessage,
  buildContextMarkdown,
  diagnoseProvider,
  parseWorkspaceInstructions,
  type IdeContextPayload,
} from "../src/index.js";

const context: IdeContextPayload = {
  activeFilePath: "src/service.ts",
  languageId: "typescript",
  selectedText: "export function add(a: number, b: number) {\n  return a + b;\n}",
  cursorPrefix: "const before = true;\n",
  cursorSuffix: "\nconst after = true;",
  relatedSnippets: [
    {
      path: "src/service.test.ts",
      languageId: "typescript",
      text: "expect(add(1, 2)).toBe(3);",
    },
  ],
};

describe("IDE context markdown", () => {
  it("preserves selected text while trimming surrounding context", () => {
    const markdown = buildContextMarkdown(
      {
        ...context,
        activeFileText: "x".repeat(500),
      },
      { maxActiveFileChars: 40, maxSnippetChars: 30 },
    );

    expect(markdown).toContain("Selected code from src/service.ts");
    expect(markdown).toContain("return a + b");
    expect(markdown).toContain("Active file excerpt");
    expect(markdown.length).toBeLessThan(1200);
  });
});

describe("action prompt builder", () => {
  it("builds a write-tests message with context", () => {
    const message = buildActionUserMessage("write-tests", context);

    expect(message).toContain("Write focused tests");
    expect(message).toContain("src/service.ts");
    expect(message).toContain("return a + b");
  });

  it("keeps the CodeSetu system message aligned to Indian developers", () => {
    expect(buildCodeSetuSystemMessage()).toContain("Indian developers");
  });
});

describe("workspace instruction parser", () => {
  it("parses valid skills and checks and reports invalid markdown", () => {
    const result = parseWorkspaceInstructions([
      {
        kind: "skill",
        path: ".codesetu/skills/spring.md",
        content:
          "---\nid: spring-reviewer\nname: Spring Reviewer\ndescription: Review Spring code.\n---\nUse Spring guidance.",
      },
      {
        kind: "check",
        path: ".codesetu/checks/security.md",
        content:
          "---\nid: security-review\nname: Security Review\ndescription: Check auth and secrets.\n---\nReturn findings.",
      },
      {
        kind: "skill",
        path: ".codesetu/skills/broken.md",
        content: "missing frontmatter",
      },
    ]);

    expect(result.skills).toHaveLength(1);
    expect(result.checks).toHaveLength(1);
    expect(result.warnings).toEqual([".codesetu/skills/broken.md: missing YAML frontmatter"]);
  });
});

describe("provider diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("classifies missing model before creating a provider", async () => {
    const result = await diagnoseProvider({
      providerOptions: {
        provider: "sarvam",
        apiKey: "test-key",
        baseURL: "https://api.sarvam.ai/v1",
        model: "",
      },
      createProvider: vi.fn(),
    });

    expect(result.status).toBe("missing-config");
    expect(result.message).toContain("model");
    expect(result.provider).toBe("sarvam");
    expect(result.baseURL).toBe("https://api.sarvam.ai/v1");
    expect(result.model).toBe("");
    expect(result.hasApiKey).toBe(true);
  });

  it("classifies default Sarvam without API key before creating a provider", async () => {
    vi.stubEnv("SARVAM_MODEL", "");
    vi.stubEnv("CODESETU_MODEL", "");
    vi.stubEnv("SARVAM_API_KEY", "");
    vi.stubEnv("CODESETU_API_KEY", "");
    const createProvider = vi.fn();

    const result = await diagnoseProvider({
      providerOptions: {
        provider: "sarvam",
      },
      createProvider,
    });

    expect(result.status).toBe("missing-config");
    expect(result.message).toContain("API key");
    expect(result.provider).toBe("sarvam");
    expect(result.baseURL).toBe("https://api.sarvam.ai/v1");
    expect(result.model).toBe("sarvam-30b");
    expect(result.hasApiKey).toBe(false);
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("classifies missing API key before creating a provider", async () => {
    vi.stubEnv("SARVAM_API_KEY", "");
    vi.stubEnv("CODESETU_API_KEY", "");
    const createProvider = vi.fn();

    const result = await diagnoseProvider({
      providerOptions: {
        provider: "sarvam",
        model: "sarvam-test-model",
      },
      createProvider,
    });

    expect(result.status).toBe("missing-config");
    expect(result.message).toContain("API key");
    expect(result.provider).toBe("sarvam");
    expect(result.baseURL).toBe("https://api.sarvam.ai/v1");
    expect(result.model).toBe("sarvam-test-model");
    expect(result.hasApiKey).toBe(false);
    expect(createProvider).not.toHaveBeenCalled();
  });

  it("returns ok with latency when provider chat succeeds", async () => {
    const chat = vi.fn().mockResolvedValue({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "test-model",
      choices: [],
    });

    const result = await diagnoseProvider({
      providerOptions: {
        provider: "sarvam",
        apiKey: "test-key",
        model: "sarvam-test-model",
      },
      createProvider: vi.fn(() => ({
        chat,
        completeFim: vi.fn(),
      })),
    });

    expect(result.status).toBe("ok");
    expect(result.provider).toBe("sarvam");
    expect(result.baseURL).toBe("https://api.sarvam.ai/v1");
    expect(result.model).toBe("sarvam-test-model");
    expect(result.hasApiKey).toBe(true);
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(chat).toHaveBeenCalledOnce();
  });

  it("reports env-derived model and API key presence without leaking the key", async () => {
    vi.stubEnv("SARVAM_MODEL", "sarvam-env-model");
    vi.stubEnv("SARVAM_API_KEY", "secret-env-key");
    const chat = vi.fn().mockResolvedValue({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 0,
      model: "sarvam-env-model",
      choices: [],
    });

    const result = await diagnoseProvider({
      providerOptions: {
        provider: "sarvam",
      },
      createProvider: vi.fn(() => ({
        chat,
        completeFim: vi.fn(),
      })),
    });

    expect(result.status).toBe("ok");
    expect(result.provider).toBe("sarvam");
    expect(result.model).toBe("sarvam-env-model");
    expect(result.hasApiKey).toBe(true);
    expect(JSON.stringify(result)).not.toContain("secret-env-key");
  });

  it("returns provider errors with the error message", async () => {
    const chat = vi.fn().mockRejectedValue(new Error("diagnostic failed"));

    const result = await diagnoseProvider({
      providerOptions: {
        provider: "sarvam",
        apiKey: "test-key",
        model: "sarvam-test-model",
      },
      createProvider: vi.fn(() => ({
        chat,
        completeFim: vi.fn(),
      })),
    });

    expect(result.status).toBe("error");
    expect(result.provider).toBe("sarvam");
    expect(result.baseURL).toBe("https://api.sarvam.ai/v1");
    expect(result.model).toBe("sarvam-test-model");
    expect(result.hasApiKey).toBe(true);
    expect(result.message).toBe("diagnostic failed");
  });
});
