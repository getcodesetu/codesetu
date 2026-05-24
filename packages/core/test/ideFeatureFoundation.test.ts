import { describe, expect, it, vi } from "vitest";

import {
  buildActionUserMessage,
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
    expect(result.warnings).toEqual([
      ".codesetu/skills/broken.md: missing YAML frontmatter",
    ]);
  });
});

describe("provider diagnostics", () => {
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
  });
});
