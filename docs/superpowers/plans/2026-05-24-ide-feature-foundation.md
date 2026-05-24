# CodeSetu IDE Feature Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real chat, repo-aware context, selected-code actions, provider setup/diagnostics, and workspace skills/checks in both the VS Code and JetBrains plugins.

**Architecture:** Add a shared TypeScript IDE assistant contract in `@codesetu/core`, then implement host adapters in VS Code and JetBrains. VS Code imports the shared contract directly; JetBrains mirrors the contract in Kotlin and verifies parity with focused unit tests.

**Tech Stack:** TypeScript, Vitest, VS Code extension API, Kotlin 2.2, IntelliJ Platform Gradle Plugin 2.1, Java `HttpClient`, Kotlin serialization.

---

## Starting State

Baseline command run on `codex-ide-feature-foundation`:

```bash
corepack pnpm test
```

Expected current result:

```text
packages/core: 10 tests passed
apps/vscode: 2 tests passed
packages/plugin-sdk: no tests found, exits 0
apps/jetbrains: pnpm script prints Gradle test instruction
```

## File Structure

Core shared contract:

- Create `packages/core/src/ide/types.ts`: shared action, context, diagnostic, skill, and check types.
- Create `packages/core/src/ide/context.ts`: context rendering and trimming helpers.
- Create `packages/core/src/ide/actions.ts`: selected-code action definitions and prompt builders.
- Create `packages/core/src/ide/workspaceInstructions.ts`: markdown frontmatter parser for skills/checks.
- Create `packages/core/src/ide/diagnostics.ts`: provider diagnostic classifier and runner.
- Modify `packages/core/src/index.ts`: export the new IDE contract.
- Test `packages/core/test/ideFeatureFoundation.test.ts`.

VS Code adapter:

- Create `apps/vscode/src/ideContext.ts`: collect active editor context and workspace snippets.
- Create `apps/vscode/src/workspaceInstructions.ts`: discover `.codesetu/skills/*.md` and `.codesetu/checks/*.md`.
- Create `apps/vscode/src/codeActions.ts`: register Explain, Refactor, Write Tests, Fix Bug, and Add Docs commands.
- Create `apps/vscode/src/providerSetup.ts`: first-run provider setup flow.
- Create `apps/vscode/src/providerDiagnostics.ts`: provider diagnostic command.
- Modify `apps/vscode/src/chatPanel.ts`: support programmatic messages and richer command output.
- Modify `apps/vscode/src/extension.ts`: register commands and pass context/instructions into chat.
- Modify `apps/vscode/src/configuration.ts`: expose provider setting names and safe config summaries.
- Modify `apps/vscode/package.json`: contribute commands.
- Test `apps/vscode/test/ideContext.test.ts`.
- Test `apps/vscode/test/packageCommands.test.ts`.

JetBrains adapter:

- Modify `apps/jetbrains/build.gradle.kts`: add Kotlin serialization and Kotlin test dependencies.
- Modify `apps/jetbrains/src/main/resources/META-INF/plugin.xml`: register tool window, configurable, and actions.
- Modify `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/OpenChatAction.kt`: open the real tool window.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/model/CodeSetuModels.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/settings/CodeSetuSettingsState.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/settings/CodeSetuSettingsConfigurable.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/provider/CodeSetuProviderClient.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/provider/ProviderDiagnostics.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/context/IdeContextCollector.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/instructions/WorkspaceInstructions.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/prompts/PromptBuilder.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/toolwindow/CodeSetuChatService.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/toolwindow/CodeSetuToolWindowFactory.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/CodeSetuEditorAction.kt`.
- Create `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/DiagnoseProviderAction.kt`.
- Test `apps/jetbrains/src/test/kotlin/ai/codesetu/WorkspaceInstructionsTest.kt`.
- Test `apps/jetbrains/src/test/kotlin/ai/codesetu/PromptBuilderTest.kt`.
- Test `apps/jetbrains/src/test/kotlin/ai/codesetu/ProviderPayloadTest.kt`.

Docs:

- Modify `README.md`.
- Modify `INSTALL.md`.
- Modify `docs/ARCHITECTURE.md`.
- Modify `apps/vscode/README.md`.
- Modify `apps/jetbrains/README.md`.

---

## Task 1: Core IDE Contract, Prompt Builders, and Parsers

**Files:**

- Create: `packages/core/src/ide/types.ts`
- Create: `packages/core/src/ide/context.ts`
- Create: `packages/core/src/ide/actions.ts`
- Create: `packages/core/src/ide/workspaceInstructions.ts`
- Create: `packages/core/src/ide/diagnostics.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/ideFeatureFoundation.test.ts`

- [ ] **Step 1: Write failing core tests**

Create `packages/core/test/ideFeatureFoundation.test.ts`:

```ts
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
```

- [ ] **Step 2: Run core tests to verify they fail**

Run:

```bash
corepack pnpm --dir packages/core test -- ideFeatureFoundation
```

Expected: FAIL because `../src/index.js` does not export the new IDE helpers.

- [ ] **Step 3: Add core types**

Create `packages/core/src/ide/types.ts`:

```ts
import type { ProviderFactoryOptions } from "../providers/registry.js";

export const IDE_ACTION_IDS = ["explain", "refactor", "write-tests", "fix-bug", "add-docs"] as const;

export type IdeActionId = (typeof IDE_ACTION_IDS)[number];

export interface WorkspaceSnippet {
  path: string;
  languageId?: string;
  text: string;
}

export interface IdeContextPayload {
  activeFilePath?: string;
  languageId?: string;
  selectedText?: string;
  activeFileText?: string;
  cursorPrefix?: string;
  cursorSuffix?: string;
  relatedSnippets?: readonly WorkspaceSnippet[];
}

export interface WorkspaceInstructionSource {
  kind: "skill" | "check";
  path: string;
  content: string;
}

export interface WorkspaceInstruction {
  id: string;
  name: string;
  description: string;
  sourcePath: string;
  body: string;
}

export interface WorkspaceInstructionParseResult {
  skills: WorkspaceInstruction[];
  checks: WorkspaceInstruction[];
  warnings: string[];
}

export type ProviderDiagnosticStatus = "missing-config" | "ok" | "error";

export interface ProviderDiagnostic {
  status: ProviderDiagnosticStatus;
  provider: string;
  baseURL?: string;
  model?: string;
  hasApiKey: boolean;
  latencyMs?: number;
  message: string;
}

export interface DiagnoseProviderOptions {
  providerOptions: ProviderFactoryOptions;
  createProvider(): {
    chat(request: {
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      maxTokens?: number;
      temperature?: number;
    }): Promise<unknown>;
  };
}
```

- [ ] **Step 4: Add context markdown helpers**

Create `packages/core/src/ide/context.ts`:

```ts
import type { IdeContextPayload, WorkspaceSnippet } from "./types.js";

export interface ContextMarkdownOptions {
  maxActiveFileChars?: number;
  maxSnippetChars?: number;
}

export function buildContextMarkdown(
  context: IdeContextPayload,
  options: ContextMarkdownOptions = {},
): string {
  const maxActiveFileChars = options.maxActiveFileChars ?? 12_000;
  const maxSnippetChars = options.maxSnippetChars ?? 2_000;
  const sections: string[] = [];

  if (context.activeFilePath !== undefined) {
    sections.push(`Active file: ${context.activeFilePath}`);
  }

  if (context.languageId !== undefined) {
    sections.push(`Language: ${context.languageId}`);
  }

  if (hasText(context.selectedText)) {
    sections.push(
      fenced(
        `Selected code from ${context.activeFilePath ?? "active file"}`,
        context.languageId,
        context.selectedText,
      ),
    );
  }

  if (hasText(context.activeFileText)) {
    sections.push(
      fenced(
        "Active file excerpt",
        context.languageId,
        trimMiddle(context.activeFileText, maxActiveFileChars),
      ),
    );
  }

  if (hasText(context.cursorPrefix) || hasText(context.cursorSuffix)) {
    sections.push(
      fenced(
        "Cursor neighborhood",
        context.languageId,
        `${trimStart(context.cursorPrefix ?? "", 2_000)}\n<cursor>\n${trimEnd(
          context.cursorSuffix ?? "",
          2_000,
        )}`,
      ),
    );
  }

  for (const snippet of context.relatedSnippets ?? []) {
    sections.push(renderSnippet(snippet, maxSnippetChars));
  }

  return sections.join("\n\n");
}

export function trimMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const half = Math.floor((maxChars - 31) / 2);
  return `${value.slice(0, half)}\n...[trimmed for context]...\n${value.slice(-half)}`;
}

function renderSnippet(snippet: WorkspaceSnippet, maxSnippetChars: number): string {
  return fenced(
    `Related workspace snippet: ${snippet.path}`,
    snippet.languageId,
    trimMiddle(snippet.text, maxSnippetChars),
  );
}

function fenced(label: string, languageId: string | undefined, value: string): string {
  return `### ${label}\n\n\`\`\`${languageId ?? ""}\n${value}\n\`\`\``;
}

function trimStart(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(-maxChars);
}

function trimEnd(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

function hasText(value: string | undefined): value is string {
  return value !== undefined && value.trim().length > 0;
}
```

- [ ] **Step 5: Add selected-code action prompts**

Create `packages/core/src/ide/actions.ts`:

```ts
import { buildContextMarkdown } from "./context.js";
import type { IdeActionId, IdeContextPayload, WorkspaceInstruction } from "./types.js";

export interface IdeActionDefinition {
  id: IdeActionId;
  title: string;
  instruction: string;
}

export const IDE_ACTIONS: readonly IdeActionDefinition[] = [
  {
    id: "explain",
    title: "Explain",
    instruction: "Explain the selected code clearly and concisely. Include key control flow, inputs, outputs, and risks.",
  },
  {
    id: "refactor",
    title: "Refactor",
    instruction: "Suggest a focused refactor for the selected code. Preserve behavior and explain the trade-offs.",
  },
  {
    id: "write-tests",
    title: "Write Tests",
    instruction: "Write focused tests for the selected code. Prefer examples that cover normal behavior and edge cases.",
  },
  {
    id: "fix-bug",
    title: "Fix Bug",
    instruction: "Identify the likely bug in the selected code and propose the smallest safe fix.",
  },
  {
    id: "add-docs",
    title: "Add Docs",
    instruction: "Add useful documentation for the selected code. Keep it accurate and close to the code.",
  },
];

export function buildActionUserMessage(
  actionId: IdeActionId,
  context: IdeContextPayload,
  instructions: readonly WorkspaceInstruction[] = [],
): string {
  const action = IDE_ACTIONS.find((candidate) => candidate.id === actionId);

  if (action === undefined) {
    throw new Error(`Unsupported CodeSetu action: ${actionId}`);
  }

  const instructionBlock = instructions
    .map((instruction) => `### ${instruction.name}\n${instruction.body}`)
    .join("\n\n");

  return [
    action.instruction,
    instructionBlock.length === 0 ? "" : `Workspace guidance:\n\n${instructionBlock}`,
    "Use this IDE context:",
    buildContextMarkdown(context),
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export function buildCodeSetuSystemMessage(instructions: readonly WorkspaceInstruction[] = []): string {
  const base =
    "You are CodeSetu, an AI coding assistant for Indian developers. Be concise, correct, practical, and privacy-aware.";

  if (instructions.length === 0) {
    return base;
  }

  return `${base}\n\nFollow applicable workspace guidance when it helps the user's request.`;
}
```

- [ ] **Step 6: Add workspace instruction parser**

Create `packages/core/src/ide/workspaceInstructions.ts`:

```ts
import type {
  WorkspaceInstruction,
  WorkspaceInstructionParseResult,
  WorkspaceInstructionSource,
} from "./types.js";

const frontmatterPattern = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseWorkspaceInstructions(
  sources: readonly WorkspaceInstructionSource[],
): WorkspaceInstructionParseResult {
  const skills: WorkspaceInstruction[] = [];
  const checks: WorkspaceInstruction[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (const source of sources) {
    const parsed = parseOne(source);

    if (parsed.warning !== undefined) {
      warnings.push(parsed.warning);
      continue;
    }

    if (parsed.instruction === undefined) {
      continue;
    }

    if (seenIds.has(parsed.instruction.id)) {
      warnings.push(`${source.path}: duplicate instruction id "${parsed.instruction.id}"`);
      continue;
    }

    seenIds.add(parsed.instruction.id);

    if (source.kind === "skill") {
      skills.push(parsed.instruction);
    } else {
      checks.push(parsed.instruction);
    }
  }

  return { skills, checks, warnings };
}

function parseOne(source: WorkspaceInstructionSource): {
  instruction?: WorkspaceInstruction;
  warning?: string;
} {
  const match = frontmatterPattern.exec(source.content);

  if (match === null) {
    return { warning: `${source.path}: missing YAML frontmatter` };
  }

  const metadata = parseSimpleYaml(match[1] ?? "");
  const id = metadata.id?.trim();
  const name = metadata.name?.trim();
  const description = metadata.description?.trim();
  const body = (match[2] ?? "").trim();

  if (!id || !name || !description) {
    return { warning: `${source.path}: id, name, and description are required` };
  }

  if (body.length === 0) {
    return { warning: `${source.path}: instruction body is required` };
  }

  return {
    instruction: {
      id,
      name,
      description,
      sourcePath: source.path,
      body,
    },
  };
}

function parseSimpleYaml(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of yaml.split("\n")) {
    const separator = line.indexOf(":");

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");

    result[key] = value;
  }

  return result;
}
```

- [ ] **Step 7: Add provider diagnostics**

Create `packages/core/src/ide/diagnostics.ts`:

```ts
import type { DiagnoseProviderOptions, ProviderDiagnostic } from "./types.js";

export async function diagnoseProvider(options: DiagnoseProviderOptions): Promise<ProviderDiagnostic> {
  const provider = options.providerOptions.provider ?? "sarvam";
  const baseURL = options.providerOptions.baseURL;
  const model = options.providerOptions.model;
  const hasApiKey = (options.providerOptions.apiKey ?? "").trim().length > 0;

  if ((model ?? "").trim().length === 0) {
    return {
      status: "missing-config",
      provider,
      baseURL,
      model,
      hasApiKey,
      message: "CodeSetu needs a model before it can send chat requests.",
    };
  }

  try {
    const startedAt = Date.now();
    const client = options.createProvider();

    await client.chat({
      messages: [
        { role: "system", content: "You are CodeSetu diagnostics." },
        { role: "user", content: "Reply with OK." },
      ],
      maxTokens: 8,
      temperature: 0,
    });

    return {
      status: "ok",
      provider,
      baseURL,
      model,
      hasApiKey,
      latencyMs: Date.now() - startedAt,
      message: "Provider connection succeeded.",
    };
  } catch (error: unknown) {
    return {
      status: "error",
      provider,
      baseURL,
      model,
      hasApiKey,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 8: Export core IDE helpers**

Modify `packages/core/src/index.ts`:

```ts
export { buildActionUserMessage, buildCodeSetuSystemMessage, IDE_ACTIONS } from "./ide/actions.js";
export { buildContextMarkdown, trimMiddle, type ContextMarkdownOptions } from "./ide/context.js";
export { diagnoseProvider } from "./ide/diagnostics.js";
export type {
  DiagnoseProviderOptions,
  IdeActionId,
  IdeContextPayload,
  ProviderDiagnostic,
  ProviderDiagnosticStatus,
  WorkspaceInstruction,
  WorkspaceInstructionParseResult,
  WorkspaceInstructionSource,
  WorkspaceSnippet,
} from "./ide/types.js";
export { IDE_ACTION_IDS } from "./ide/types.js";
export { parseWorkspaceInstructions } from "./ide/workspaceInstructions.js";
```

Keep the existing exports in the same file.

- [ ] **Step 9: Run core tests to verify they pass**

Run:

```bash
corepack pnpm --dir packages/core test -- ideFeatureFoundation
```

Expected: PASS for `ideFeatureFoundation.test.ts`.

- [ ] **Step 10: Commit core contract**

Run:

```bash
git add packages/core/src packages/core/test/ideFeatureFoundation.test.ts
git commit -m "feat(core): add IDE assistant contract"
```

---

## Task 2: VS Code Context, Chat Commands, and Selected-Code Actions

**Files:**

- Create: `apps/vscode/src/ideContext.ts`
- Create: `apps/vscode/src/workspaceInstructions.ts`
- Create: `apps/vscode/src/codeActions.ts`
- Modify: `apps/vscode/src/chatPanel.ts`
- Modify: `apps/vscode/src/extension.ts`
- Modify: `apps/vscode/package.json`
- Test: `apps/vscode/test/ideContext.test.ts`
- Test: `apps/vscode/test/packageCommands.test.ts`

- [ ] **Step 1: Write failing VS Code tests**

Create `apps/vscode/test/ideContext.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildEditorContext } from "../src/ideContext.js";

describe("buildEditorContext", () => {
  it("preserves selected text and bounded cursor context", () => {
    const context = buildEditorContext({
      activeFilePath: "src/example.ts",
      languageId: "typescript",
      text: "const before = true;\nfunction add(a: number, b: number) {\n  return a + b;\n}\nconst after = true;\n",
      selectionStart: 21,
      selectionEnd: 78,
      maxActiveFileChars: 50,
      maxCursorChars: 20,
    });

    expect(context.activeFilePath).toBe("src/example.ts");
    expect(context.selectedText).toContain("function add");
    expect(context.cursorPrefix?.length).toBeLessThanOrEqual(20);
    expect(context.cursorSuffix?.length).toBeLessThanOrEqual(20);
    expect(context.activeFileText?.length).toBeLessThanOrEqual(50);
  });
});
```

Create `apps/vscode/test/packageCommands.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
) as {
  contributes: {
    commands: Array<{ command: string; title: string }>;
  };
};

describe("VS Code command contributions", () => {
  it("contributes CodeSetu chat, setup, diagnostics, and editor actions", () => {
    const commands = packageJson.contributes.commands.map((command) => command.command);

    expect(commands).toEqual(
      expect.arrayContaining([
        "codesetu.openChat",
        "codesetu.setupProvider",
        "codesetu.diagnoseProvider",
        "codesetu.explainSelection",
        "codesetu.refactorSelection",
        "codesetu.writeTestsForSelection",
        "codesetu.fixBugInSelection",
        "codesetu.addDocsToSelection",
      ]),
    );
  });
});
```

- [ ] **Step 2: Run VS Code tests to verify they fail**

Run:

```bash
corepack pnpm --dir apps/vscode test -- ideContext packageCommands
```

Expected: FAIL because `ideContext.ts` and the new command contributions do not exist.

- [ ] **Step 3: Add pure editor-context helper**

Create `apps/vscode/src/ideContext.ts`:

```ts
import type { IdeContextPayload, WorkspaceSnippet } from "@codesetu/core";
import * as vscode from "vscode";

export interface BuildEditorContextOptions {
  activeFilePath?: string;
  languageId?: string;
  text: string;
  selectionStart: number;
  selectionEnd: number;
  maxActiveFileChars?: number;
  maxCursorChars?: number;
  relatedSnippets?: readonly WorkspaceSnippet[];
}

export function buildEditorContext(options: BuildEditorContextOptions): IdeContextPayload {
  const maxActiveFileChars = options.maxActiveFileChars ?? 12_000;
  const maxCursorChars = options.maxCursorChars ?? 2_000;
  const selectionStart = Math.max(0, Math.min(options.selectionStart, options.text.length));
  const selectionEnd = Math.max(selectionStart, Math.min(options.selectionEnd, options.text.length));

  return {
    activeFilePath: options.activeFilePath,
    languageId: options.languageId,
    selectedText: options.text.slice(selectionStart, selectionEnd),
    activeFileText: trimMiddle(options.text, maxActiveFileChars),
    cursorPrefix: options.text.slice(Math.max(0, selectionStart - maxCursorChars), selectionStart),
    cursorSuffix: options.text.slice(selectionEnd, Math.min(options.text.length, selectionEnd + maxCursorChars)),
    relatedSnippets: options.relatedSnippets ?? [],
  };
}

export async function collectVSCodeContext(): Promise<IdeContextPayload> {
  const editor = vscode.window.activeTextEditor;

  if (editor === undefined) {
    return {};
  }

  const document = editor.document;
  const selection = editor.selection;
  const text = document.getText();
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const activeFilePath =
    workspaceFolder === undefined
      ? document.uri.fsPath
      : vscode.workspace.asRelativePath(document.uri, false);

  return buildEditorContext({
    activeFilePath,
    languageId: document.languageId,
    text,
    selectionStart: document.offsetAt(selection.start),
    selectionEnd: document.offsetAt(selection.end),
    relatedSnippets: await collectWorkspaceSnippets(document.uri),
  });
}

async function collectWorkspaceSnippets(activeUri: vscode.Uri): Promise<WorkspaceSnippet[]> {
  const files = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,py,java,kt,go,rs,md,json,yml,yaml}",
    "{**/node_modules/**,**/dist/**,**/build/**,**/.git/**}",
    8,
  );
  const snippets: WorkspaceSnippet[] = [];

  for (const file of files) {
    if (file.toString() === activeUri.toString()) {
      continue;
    }

    const document = await vscode.workspace.openTextDocument(file);
    snippets.push({
      path: vscode.workspace.asRelativePath(file, false),
      languageId: document.languageId,
      text: document.getText().slice(0, 2_000),
    });
  }

  return snippets;
}

function trimMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const half = Math.floor(maxChars / 2);
  return `${value.slice(0, half)}\n...[trimmed for context]...\n${value.slice(-half)}`;
}
```

- [ ] **Step 4: Add workspace instruction discovery**

Create `apps/vscode/src/workspaceInstructions.ts`:

```ts
import {
  parseWorkspaceInstructions,
  type WorkspaceInstructionParseResult,
  type WorkspaceInstructionSource,
} from "@codesetu/core";
import * as vscode from "vscode";

export async function loadWorkspaceInstructions(
  outputChannel: vscode.OutputChannel,
): Promise<WorkspaceInstructionParseResult> {
  const skillFiles = await vscode.workspace.findFiles(".codesetu/skills/*.md", undefined, 50);
  const checkFiles = await vscode.workspace.findFiles(".codesetu/checks/*.md", undefined, 50);
  const sources: WorkspaceInstructionSource[] = [];

  for (const file of skillFiles) {
    sources.push({
      kind: "skill",
      path: vscode.workspace.asRelativePath(file, false),
      content: Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8"),
    });
  }

  for (const file of checkFiles) {
    sources.push({
      kind: "check",
      path: vscode.workspace.asRelativePath(file, false),
      content: Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8"),
    });
  }

  const result = parseWorkspaceInstructions(sources);

  for (const warning of result.warnings) {
    outputChannel.appendLine(`Workspace instruction warning: ${warning}`);
  }

  return result;
}
```

- [ ] **Step 5: Make chat panel accept programmatic messages**

Modify `apps/vscode/src/chatPanel.ts`:

```ts
export class ChatPanel {
  // keep existing fields

  public async sendUserMessage(text: string): Promise<void> {
    await this.submitMessage(text);
  }

  public static async createOrShowAndSend(
    extensionUri: vscode.Uri,
    responder: ChatResponder,
    outputChannel: vscode.OutputChannel,
    text: string,
  ): Promise<void> {
    ChatPanel.createOrShow(extensionUri, responder, outputChannel);
    await ChatPanel.currentPanel?.sendUserMessage(text);
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isSendMessageRequest(message) || this.inFlight) {
      return;
    }

    await this.submitMessage(message.text);
  }

  private async submitMessage(rawText: string): Promise<void> {
    if (this.inFlight) {
      return;
    }

    const text = rawText.trim();

    if (text.length === 0) {
      return;
    }

    this.inFlight = true;
    void this.panel.webview.postMessage({ type: "busy", value: true });
    void this.panel.webview.postMessage({ type: "userMessage", text });
    this.history.push({ role: "user", content: text });

    try {
      const response = await this.responder(this.history);
      this.history.push({ role: "assistant", content: response });
      void this.panel.webview.postMessage({ type: "assistantMessage", text: response });
    } catch (error: unknown) {
      this.outputChannel.appendLine(`Chat request failed: ${formatErrorMessage(error)}`);
      void this.panel.webview.postMessage({
        type: "error",
        text: "CodeSetu could not complete that request. Check your provider settings and API key.",
      });
    } finally {
      this.inFlight = false;
      void this.panel.webview.postMessage({ type: "busy", value: false });
    }
  }
}
```

In the webview message handler, add:

```js
if (message.type === "userMessage") {
  appendMessage("user", message.text);
}
```

- [ ] **Step 6: Add selected-code command registration**

Create `apps/vscode/src/codeActions.ts`:

```ts
import {
  buildActionUserMessage,
  type IdeActionId,
  type WorkspaceInstruction,
} from "@codesetu/core";
import * as vscode from "vscode";

import { ChatPanel, type ChatResponder } from "./chatPanel";
import { collectVSCodeContext } from "./ideContext";

interface RegisterCodeActionsOptions {
  context: vscode.ExtensionContext;
  responder: ChatResponder;
  outputChannel: vscode.OutputChannel;
  loadInstructions(): Promise<readonly WorkspaceInstruction[]>;
}

const commandMap: Array<{ command: string; actionId: IdeActionId }> = [
  { command: "codesetu.explainSelection", actionId: "explain" },
  { command: "codesetu.refactorSelection", actionId: "refactor" },
  { command: "codesetu.writeTestsForSelection", actionId: "write-tests" },
  { command: "codesetu.fixBugInSelection", actionId: "fix-bug" },
  { command: "codesetu.addDocsToSelection", actionId: "add-docs" },
];

export function registerCodeSetuEditorActions(options: RegisterCodeActionsOptions): vscode.Disposable[] {
  return commandMap.map(({ command, actionId }) =>
    vscode.commands.registerCommand(command, async () => {
      const ideContext = await collectVSCodeContext();
      const instructions = await options.loadInstructions();
      const message = buildActionUserMessage(actionId, ideContext, instructions);

      await ChatPanel.createOrShowAndSend(
        options.context.extensionUri,
        options.responder,
        options.outputChannel,
        message,
      );
    }),
  );
}
```

- [ ] **Step 7: Contribute VS Code commands**

Modify `apps/vscode/package.json` command contributions:

```json
{
  "command": "codesetu.setupProvider",
  "title": "CodeSetu: Setup Provider",
  "category": "CodeSetu"
},
{
  "command": "codesetu.diagnoseProvider",
  "title": "CodeSetu: Diagnose Provider",
  "category": "CodeSetu"
},
{
  "command": "codesetu.explainSelection",
  "title": "CodeSetu: Explain Selection",
  "category": "CodeSetu"
},
{
  "command": "codesetu.refactorSelection",
  "title": "CodeSetu: Refactor Selection",
  "category": "CodeSetu"
},
{
  "command": "codesetu.writeTestsForSelection",
  "title": "CodeSetu: Write Tests for Selection",
  "category": "CodeSetu"
},
{
  "command": "codesetu.fixBugInSelection",
  "title": "CodeSetu: Fix Bug in Selection",
  "category": "CodeSetu"
},
{
  "command": "codesetu.addDocsToSelection",
  "title": "CodeSetu: Add Docs to Selection",
  "category": "CodeSetu"
}
```

- [ ] **Step 8: Wire chat context and actions into activation**

Modify `apps/vscode/src/extension.ts`:

```ts
import {
  buildCodeSetuSystemMessage,
  buildContextMarkdown,
  type IdeContextPayload,
  type WorkspaceInstruction,
} from "@codesetu/core";
import { registerCodeSetuEditorActions } from "./codeActions";
import { loadWorkspaceInstructions } from "./workspaceInstructions";

// inside activate()
const loadInstructions = async (): Promise<WorkspaceInstruction[]> => {
  const result = await loadWorkspaceInstructions(outputChannel);
  return [...result.skills, ...result.checks];
};

const responder = async (messages: ChatMessage[]) =>
  sendChatRequest(
    messages,
    statusBarItem,
    outputChannel,
    await loadInstructions(),
    await collectVSCodeContext(),
  );

const openChatCommand = vscode.commands.registerCommand("codesetu.openChat", () => {
  ChatPanel.createOrShow(context.extensionUri, responder, outputChannel);
});

context.subscriptions.push(
  ...registerCodeSetuEditorActions({
    context,
    responder,
    outputChannel,
    loadInstructions,
  }),
);
```

Change `sendChatRequest` signature:

```ts
async function sendChatRequest(
  messages: ChatMessage[],
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel,
  instructions: readonly WorkspaceInstruction[] = [],
  ideContext: IdeContextPayload = {},
): Promise<string> {
  // existing configuration/provider code
  const contextMessage: ChatMessage = {
    role: "user",
    content: `Current IDE context:\n\n${buildContextMarkdown(ideContext)}`,
  };
  const contextualMessages =
    buildContextMarkdown(ideContext).trim().length === 0 ? messages : [contextMessage, ...messages];
  const completion = await provider.chat({
    messages: [
      {
        role: "system",
        content: buildCodeSetuSystemMessage(instructions),
      },
      ...contextualMessages,
    ],
    maxTokens: configuration.chatMaxTokens,
    temperature: configuration.chatTemperature,
  });
}
```

- [ ] **Step 9: Run VS Code tests**

Run:

```bash
corepack pnpm --dir apps/vscode test -- ideContext packageCommands
```

Expected: PASS.

- [ ] **Step 10: Commit VS Code context and actions**

Run:

```bash
git add apps/vscode/package.json apps/vscode/src apps/vscode/test
git commit -m "feat(vscode): add context-aware editor actions"
```

---

## Task 3: VS Code Provider Setup and Diagnostics

**Files:**

- Create: `apps/vscode/src/providerSetup.ts`
- Create: `apps/vscode/src/providerDiagnostics.ts`
- Modify: `apps/vscode/src/configuration.ts`
- Modify: `apps/vscode/src/extension.ts`
- Test: `apps/vscode/test/packageCommands.test.ts`

- [ ] **Step 1: Add configuration summary helpers**

Modify `apps/vscode/src/configuration.ts`:

```ts
export interface CodeSetuConfigurationSummary {
  provider: ProviderId;
  baseURL?: string;
  model?: string;
  hasApiKey: boolean;
}

export function summarizeCodeSetuConfiguration(): CodeSetuConfigurationSummary {
  const configuration = readCodeSetuConfiguration();

  return {
    provider: configuration.providerOptions.provider ?? "sarvam",
    baseURL: configuration.providerOptions.baseURL,
    model: configuration.providerOptions.model,
    hasApiKey: (configuration.providerOptions.apiKey ?? "").trim().length > 0,
  };
}
```

- [ ] **Step 2: Add provider setup command**

Create `apps/vscode/src/providerSetup.ts`:

```ts
import * as vscode from "vscode";

export async function setupCodeSetuProvider(): Promise<void> {
  const provider = await vscode.window.showQuickPick(
    [
      { label: "sarvam", description: "Sarvam hosted or compatible endpoint" },
      { label: "openai-compatible", description: "Ollama, vLLM, SGLang, OpenRouter, or compatible API" },
    ],
    { placeHolder: "Choose a CodeSetu provider" },
  );

  if (provider === undefined) {
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    prompt: "Base URL",
    value: provider.label === "sarvam" ? "https://api.sarvam.ai/v1" : "http://localhost:11434/v1",
  });

  if (baseUrl === undefined) {
    return;
  }

  const model = await vscode.window.showInputBox({
    prompt: "Model id",
    value: provider.label === "openai-compatible" ? "qwen2.5-coder:7b" : "",
  });

  if (model === undefined) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    prompt: "API key",
    password: true,
    value: provider.label === "openai-compatible" && baseUrl.includes("localhost") ? "ollama" : "",
  });

  if (apiKey === undefined) {
    return;
  }

  const configuration = vscode.workspace.getConfiguration("codesetu");
  await configuration.update("provider", provider.label, vscode.ConfigurationTarget.Global);
  await configuration.update("baseUrl", baseUrl.trim(), vscode.ConfigurationTarget.Global);
  await configuration.update("model", model.trim(), vscode.ConfigurationTarget.Global);
  await configuration.update("apiKey", apiKey.trim(), vscode.ConfigurationTarget.Global);

  void vscode.window.showInformationMessage("CodeSetu provider settings updated.");
}
```

- [ ] **Step 3: Add provider diagnostics command**

Create `apps/vscode/src/providerDiagnostics.ts`:

```ts
import { createProvider, diagnoseProvider } from "@codesetu/core";
import * as vscode from "vscode";

import { readCodeSetuConfiguration, summarizeCodeSetuConfiguration } from "./configuration";

export async function runCodeSetuProviderDiagnostics(outputChannel: vscode.OutputChannel): Promise<void> {
  const configuration = readCodeSetuConfiguration();
  const summary = summarizeCodeSetuConfiguration();
  const result = await diagnoseProvider({
    providerOptions: configuration.providerOptions,
    createProvider: () => createProvider(configuration.providerOptions),
  });

  outputChannel.appendLine(`Provider: ${summary.provider}`);
  outputChannel.appendLine(`Base URL: ${summary.baseURL ?? "(default)"}`);
  outputChannel.appendLine(`Model: ${summary.model ?? "(not set)"}`);
  outputChannel.appendLine(`API key configured: ${summary.hasApiKey ? "yes" : "no"}`);
  outputChannel.appendLine(`Diagnostic: ${result.status} - ${result.message}`);

  if (result.status === "ok") {
    void vscode.window.showInformationMessage(
      `CodeSetu provider connection succeeded in ${result.latencyMs ?? 0}ms.`,
    );
    return;
  }

  void vscode.window.showWarningMessage(`CodeSetu provider diagnostic: ${result.message}`);
}
```

- [ ] **Step 4: Register setup and diagnostics commands**

Modify `apps/vscode/src/extension.ts`:

```ts
import { runCodeSetuProviderDiagnostics } from "./providerDiagnostics";
import { setupCodeSetuProvider } from "./providerSetup";

const setupProviderCommand = vscode.commands.registerCommand(
  "codesetu.setupProvider",
  setupCodeSetuProvider,
);

const diagnoseProviderCommand = vscode.commands.registerCommand("codesetu.diagnoseProvider", () =>
  runCodeSetuProviderDiagnostics(outputChannel),
);

context.subscriptions.push(setupProviderCommand, diagnoseProviderCommand);
```

- [ ] **Step 5: Run VS Code tests and build**

Run:

```bash
corepack pnpm --dir apps/vscode test
corepack pnpm --dir apps/vscode build
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit VS Code setup and diagnostics**

Run:

```bash
git add apps/vscode/src apps/vscode/test apps/vscode/package.json
git commit -m "feat(vscode): add provider setup and diagnostics"
```

---

## Task 4: JetBrains Contract, Settings, Parser, and Provider Client

**Files:**

- Modify: `apps/jetbrains/build.gradle.kts`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/model/CodeSetuModels.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/settings/CodeSetuSettingsState.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/settings/CodeSetuSettingsConfigurable.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/instructions/WorkspaceInstructions.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/prompts/PromptBuilder.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/provider/CodeSetuProviderClient.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/provider/ProviderDiagnostics.kt`
- Test: `apps/jetbrains/src/test/kotlin/ai/codesetu/WorkspaceInstructionsTest.kt`
- Test: `apps/jetbrains/src/test/kotlin/ai/codesetu/PromptBuilderTest.kt`
- Test: `apps/jetbrains/src/test/kotlin/ai/codesetu/ProviderPayloadTest.kt`

- [ ] **Step 1: Add Gradle dependencies for tests and JSON**

Modify `apps/jetbrains/build.gradle.kts`:

```kotlin
plugins {
  id("org.jetbrains.kotlin.jvm") version "2.2.0"
  id("org.jetbrains.kotlin.plugin.serialization") version "2.2.0"
  id("org.jetbrains.intellij.platform") version "2.1.0"
}

dependencies {
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
  testImplementation(kotlin("test"))

  intellijPlatform {
    val localIdePath = (project.findProperty("codesetu.intellij.path") as String?)
      ?: "/Applications/IntelliJ IDEA CE.app"
    if (file(localIdePath).exists()) {
      local(localIdePath)
    } else {
      intellijIdeaCommunity("2025.2.5")
    }
    instrumentationTools()
  }
}

tasks.test {
  useJUnitPlatform()
}
```

Keep the existing `repositories`, `kotlin`, and `intellijPlatform` blocks.

- [ ] **Step 2: Write failing JetBrains parser and prompt tests**

Create `apps/jetbrains/src/test/kotlin/ai/codesetu/WorkspaceInstructionsTest.kt`:

```kotlin
package ai.codesetu

import ai.codesetu.instructions.WorkspaceInstructionSource
import ai.codesetu.instructions.parseWorkspaceInstructions
import kotlin.test.Test
import kotlin.test.assertEquals

class WorkspaceInstructionsTest {
  @Test
  fun parsesSkillsChecksAndWarnings() {
    val result = parseWorkspaceInstructions(
      listOf(
        WorkspaceInstructionSource(
          kind = "skill",
          path = ".codesetu/skills/spring.md",
          content = "---\nid: spring-reviewer\nname: Spring Reviewer\ndescription: Review Spring code.\n---\nUse Spring guidance.",
        ),
        WorkspaceInstructionSource(
          kind = "check",
          path = ".codesetu/checks/security.md",
          content = "---\nid: security-review\nname: Security Review\ndescription: Check auth.\n---\nReturn findings.",
        ),
        WorkspaceInstructionSource(
          kind = "skill",
          path = ".codesetu/skills/broken.md",
          content = "missing frontmatter",
        ),
      ),
    )

    assertEquals(1, result.skills.size)
    assertEquals(1, result.checks.size)
    assertEquals(listOf(".codesetu/skills/broken.md: missing YAML frontmatter"), result.warnings)
  }
}
```

Create `apps/jetbrains/src/test/kotlin/ai/codesetu/PromptBuilderTest.kt`:

```kotlin
package ai.codesetu

import ai.codesetu.model.IdeActionId
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.prompts.buildActionUserMessage
import kotlin.test.Test
import kotlin.test.assertContains

class PromptBuilderTest {
  @Test
  fun buildsWriteTestsPromptWithSelectedCode() {
    val message = buildActionUserMessage(
      actionId = IdeActionId.WRITE_TESTS,
      context = IdeContextPayload(
        activeFilePath = "src/service.kt",
        languageId = "kotlin",
        selectedText = "fun add(a: Int, b: Int) = a + b",
      ),
      instructions = emptyList(),
    )

    assertContains(message, "Write focused tests")
    assertContains(message, "src/service.kt")
    assertContains(message, "fun add")
  }
}
```

- [ ] **Step 3: Add Kotlin models**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/model/CodeSetuModels.kt`:

```kotlin
package ai.codesetu.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

enum class ProviderKind(val id: String) {
  SARVAM("sarvam"),
  OPENAI_COMPATIBLE("openai-compatible");

  companion object {
    fun fromId(id: String): ProviderKind =
      entries.firstOrNull { it.id == id } ?: SARVAM
  }
}

enum class IdeActionId(val id: String) {
  EXPLAIN("explain"),
  REFACTOR("refactor"),
  WRITE_TESTS("write-tests"),
  FIX_BUG("fix-bug"),
  ADD_DOCS("add-docs"),
}

data class WorkspaceSnippet(
  val path: String,
  val languageId: String? = null,
  val text: String,
)

data class IdeContextPayload(
  val activeFilePath: String? = null,
  val languageId: String? = null,
  val selectedText: String? = null,
  val activeFileText: String? = null,
  val cursorPrefix: String? = null,
  val cursorSuffix: String? = null,
  val relatedSnippets: List<WorkspaceSnippet> = emptyList(),
)

data class WorkspaceInstruction(
  val id: String,
  val name: String,
  val description: String,
  val sourcePath: String,
  val body: String,
)

@Serializable
data class ChatMessage(
  val role: String,
  val content: String,
)

@Serializable
data class ChatCompletionRequest(
  val model: String,
  val messages: List<ChatMessage>,
  val temperature: Double = 0.2,
  @SerialName("max_tokens") val maxTokens: Int = 1024,
)

@Serializable
data class ChatCompletionResponse(
  val choices: List<ChatChoice> = emptyList(),
)

@Serializable
data class ChatChoice(
  val message: ChatMessage? = null,
)
```

- [ ] **Step 4: Add Kotlin workspace instruction parser**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/instructions/WorkspaceInstructions.kt`:

```kotlin
package ai.codesetu.instructions

import ai.codesetu.model.WorkspaceInstruction
import com.intellij.openapi.project.Project
import java.nio.charset.StandardCharsets

data class WorkspaceInstructionSource(
  val kind: String,
  val path: String,
  val content: String,
)

data class WorkspaceInstructionParseResult(
  val skills: List<WorkspaceInstruction>,
  val checks: List<WorkspaceInstruction>,
  val warnings: List<String>,
)

fun parseWorkspaceInstructions(
  sources: List<WorkspaceInstructionSource>,
): WorkspaceInstructionParseResult {
  val skills = mutableListOf<WorkspaceInstruction>()
  val checks = mutableListOf<WorkspaceInstruction>()
  val warnings = mutableListOf<String>()
  val seenIds = mutableSetOf<String>()

  for (source in sources) {
    val parsed = parseOne(source)
    val warning = parsed.warning

    if (warning != null) {
      warnings.add(warning)
      continue
    }

    val instruction = parsed.instruction ?: continue
    if (!seenIds.add(instruction.id)) {
      warnings.add("${source.path}: duplicate instruction id \"${instruction.id}\"")
      continue
    }

    if (source.kind == "skill") {
      skills.add(instruction)
    } else {
      checks.add(instruction)
    }
  }

  return WorkspaceInstructionParseResult(skills, checks, warnings)
}

fun loadWorkspaceInstructions(project: Project): List<WorkspaceInstruction> {
  val baseDir = project.baseDir ?: return emptyList()
  val sources = mutableListOf<WorkspaceInstructionSource>()
  val codesetuDir = baseDir.findChild(".codesetu") ?: return emptyList()
  val skillsDir = codesetuDir.findChild("skills")
  val checksDir = codesetuDir.findChild("checks")

  skillsDir?.children
    ?.filter { it.extension == "md" }
    ?.forEach { file ->
      sources.add(
        WorkspaceInstructionSource(
          kind = "skill",
          path = ".codesetu/skills/${file.name}",
          content = String(file.contentsToByteArray(), StandardCharsets.UTF_8),
        ),
      )
    }

  checksDir?.children
    ?.filter { it.extension == "md" }
    ?.forEach { file ->
      sources.add(
        WorkspaceInstructionSource(
          kind = "check",
          path = ".codesetu/checks/${file.name}",
          content = String(file.contentsToByteArray(), StandardCharsets.UTF_8),
        ),
      )
    }

  val result = parseWorkspaceInstructions(sources)
  return result.skills + result.checks
}

private data class ParsedInstruction(
  val instruction: WorkspaceInstruction? = null,
  val warning: String? = null,
)

private fun parseOne(source: WorkspaceInstructionSource): ParsedInstruction {
  val regex = Regex("^---\\n([\\s\\S]*?)\\n---\\n?([\\s\\S]*)$")
  val match = regex.find(source.content)
    ?: return ParsedInstruction(warning = "${source.path}: missing YAML frontmatter")

  val metadata = parseSimpleYaml(match.groupValues[1])
  val id = metadata["id"]?.trim().orEmpty()
  val name = metadata["name"]?.trim().orEmpty()
  val description = metadata["description"]?.trim().orEmpty()
  val body = match.groupValues[2].trim()

  if (id.isEmpty() || name.isEmpty() || description.isEmpty()) {
    return ParsedInstruction(warning = "${source.path}: id, name, and description are required")
  }

  if (body.isEmpty()) {
    return ParsedInstruction(warning = "${source.path}: instruction body is required")
  }

  return ParsedInstruction(
    instruction = WorkspaceInstruction(
      id = id,
      name = name,
      description = description,
      sourcePath = source.path,
      body = body,
    ),
  )
}

private fun parseSimpleYaml(yaml: String): Map<String, String> =
  yaml.lines()
    .mapNotNull { line ->
      val separator = line.indexOf(":")
      if (separator == -1) null else line.take(separator).trim() to line.drop(separator + 1).trim().trim('"', '\'')
    }
    .toMap()
```

- [ ] **Step 5: Add Kotlin prompt builder**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/prompts/PromptBuilder.kt`:

```kotlin
package ai.codesetu.prompts

import ai.codesetu.model.IdeActionId
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.model.WorkspaceInstruction

fun buildSystemMessage(instructions: List<WorkspaceInstruction>): String =
  if (instructions.isEmpty()) {
    "You are CodeSetu, an AI coding assistant for Indian developers. Be concise, correct, practical, and privacy-aware."
  } else {
    "You are CodeSetu, an AI coding assistant for Indian developers. Be concise, correct, practical, and privacy-aware.\n\nFollow applicable workspace guidance when it helps the user's request."
  }

fun buildActionUserMessage(
  actionId: IdeActionId,
  context: IdeContextPayload,
  instructions: List<WorkspaceInstruction>,
): String {
  val actionInstruction = when (actionId) {
    IdeActionId.EXPLAIN -> "Explain the selected code clearly and concisely. Include key control flow, inputs, outputs, and risks."
    IdeActionId.REFACTOR -> "Suggest a focused refactor for the selected code. Preserve behavior and explain the trade-offs."
    IdeActionId.WRITE_TESTS -> "Write focused tests for the selected code. Prefer examples that cover normal behavior and edge cases."
    IdeActionId.FIX_BUG -> "Identify the likely bug in the selected code and propose the smallest safe fix."
    IdeActionId.ADD_DOCS -> "Add useful documentation for the selected code. Keep it accurate and close to the code."
  }

  val instructionBlock = instructions.joinToString("\n\n") { "### ${it.name}\n${it.body}" }
  return listOf(
    actionInstruction,
    if (instructionBlock.isBlank()) "" else "Workspace guidance:\n\n$instructionBlock",
    "Use this IDE context:",
    buildContextMarkdown(context),
  ).filter { it.isNotBlank() }.joinToString("\n\n")
}

fun buildContextMarkdown(context: IdeContextPayload): String {
  val sections = mutableListOf<String>()

  context.activeFilePath?.let { sections.add("Active file: $it") }
  context.languageId?.let { sections.add("Language: $it") }
  context.selectedText?.takeIf { it.isNotBlank() }?.let {
    sections.add(fenced("Selected code from ${context.activeFilePath ?: "active file"}", context.languageId, it))
  }
  context.activeFileText?.takeIf { it.isNotBlank() }?.let {
    sections.add(fenced("Active file excerpt", context.languageId, trimMiddle(it, 12_000)))
  }

  return sections.joinToString("\n\n")
}

private fun fenced(label: String, languageId: String?, value: String): String =
  "### $label\n\n```${languageId.orEmpty()}\n$value\n```"

private fun trimMiddle(value: String, maxChars: Int): String =
  if (value.length <= maxChars) value else value.take(maxChars / 2) + "\n...[trimmed for context]...\n" + value.takeLast(maxChars / 2)
```

- [ ] **Step 6: Add JetBrains settings state and configurable**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/settings/CodeSetuSettingsState.kt`:

```kotlin
package ai.codesetu.settings

import ai.codesetu.model.ProviderKind
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.APP)
@State(name = "CodeSetuSettings", storages = [Storage("codesetu.xml")])
class CodeSetuSettingsState : PersistentStateComponent<CodeSetuSettingsState.State> {
  data class State(
    var provider: String = ProviderKind.SARVAM.id,
    var baseUrl: String = "https://api.sarvam.ai/v1",
    var model: String = "",
    var apiKey: String = "",
  )

  private var state = State()

  override fun getState(): State = state

  override fun loadState(state: State) {
    this.state = state
  }

  companion object {
    fun getInstance(): CodeSetuSettingsState =
      ApplicationManager.getApplication().getService(CodeSetuSettingsState::class.java)
  }
}
```

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/settings/CodeSetuSettingsConfigurable.kt`:

```kotlin
package ai.codesetu.settings

import com.intellij.openapi.options.Configurable
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.panel
import javax.swing.JComponent

class CodeSetuSettingsConfigurable : Configurable {
  private val settings = CodeSetuSettingsState.getInstance()
  private var provider = settings.state.provider
  private var baseUrl = settings.state.baseUrl
  private var model = settings.state.model
  private var apiKey = settings.state.apiKey

  override fun getDisplayName(): String = "CodeSetu"

  override fun createComponent(): JComponent = panel {
    row("Provider") { textField().bindText(::provider) }
    row("Base URL") { textField().bindText(::baseUrl) }
    row("Model") { textField().bindText(::model) }
    row("API key") { passwordField().bindText(::apiKey) }
  }

  override fun isModified(): Boolean =
    provider != settings.state.provider ||
      baseUrl != settings.state.baseUrl ||
      model != settings.state.model ||
      apiKey != settings.state.apiKey

  override fun apply() {
    settings.state.provider = provider.trim()
    settings.state.baseUrl = baseUrl.trim()
    settings.state.model = model.trim()
    settings.state.apiKey = apiKey.trim()
  }

  override fun reset() {
    provider = settings.state.provider
    baseUrl = settings.state.baseUrl
    model = settings.state.model
    apiKey = settings.state.apiKey
  }
}
```

- [ ] **Step 7: Add provider client and payload test**

Create `apps/jetbrains/src/test/kotlin/ai/codesetu/ProviderPayloadTest.kt`:

```kotlin
package ai.codesetu

import ai.codesetu.model.ChatMessage
import ai.codesetu.provider.buildChatCompletionRequestJson
import kotlin.test.Test
import kotlin.test.assertContains

class ProviderPayloadTest {
  @Test
  fun serializesOpenAiCompatibleChatPayload() {
    val payload = buildChatCompletionRequestJson(
      model = "qwen2.5-coder:7b",
      messages = listOf(ChatMessage(role = "user", content = "Hello")),
      maxTokens = 64,
      temperature = 0.1,
    )

    assertContains(payload, "\"model\":\"qwen2.5-coder:7b\"")
    assertContains(payload, "\"max_tokens\":64")
    assertContains(payload, "\"content\":\"Hello\"")
  }
}
```

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/provider/CodeSetuProviderClient.kt`:

```kotlin
package ai.codesetu.provider

import ai.codesetu.model.ChatCompletionRequest
import ai.codesetu.model.ChatCompletionResponse
import ai.codesetu.model.ChatMessage
import ai.codesetu.settings.CodeSetuSettingsState
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class CodeSetuProviderClient(
  private val httpClient: HttpClient = HttpClient.newHttpClient(),
  private val json: Json = Json { ignoreUnknownKeys = true },
) {
  fun chat(messages: List<ChatMessage>, maxTokens: Int = 1024, temperature: Double = 0.2): String {
    val state = CodeSetuSettingsState.getInstance().state
    val body = buildChatCompletionRequestJson(
      model = state.model,
      messages = messages,
      maxTokens = maxTokens,
      temperature = temperature,
      json = json,
    )
    val request = HttpRequest.newBuilder()
      .uri(URI.create(state.baseUrl.trimEnd('/') + "/chat/completions"))
      .header("Authorization", "Bearer ${state.apiKey}")
      .header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString(body))
      .build()
    val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())

    if (response.statusCode() !in 200..299) {
      error("Provider request failed with HTTP ${response.statusCode()}: ${response.body()}")
    }

    return json.decodeFromString<ChatCompletionResponse>(response.body())
      .choices
      .firstOrNull()
      ?.message
      ?.content
      .orEmpty()
  }
}

fun buildChatCompletionRequestJson(
  model: String,
  messages: List<ChatMessage>,
  maxTokens: Int,
  temperature: Double,
  json: Json = Json,
): String =
  json.encodeToString(
    ChatCompletionRequest(
      model = model,
      messages = messages,
      maxTokens = maxTokens,
      temperature = temperature,
    ),
  )
```

- [ ] **Step 8: Add provider diagnostics**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/provider/ProviderDiagnostics.kt`:

```kotlin
package ai.codesetu.provider

import ai.codesetu.model.ChatMessage
import ai.codesetu.settings.CodeSetuSettingsState
import kotlin.system.measureTimeMillis

data class ProviderDiagnosticResult(
  val status: String,
  val message: String,
  val latencyMs: Long? = null,
)

fun runProviderDiagnostic(client: CodeSetuProviderClient = CodeSetuProviderClient()): ProviderDiagnosticResult {
  val state = CodeSetuSettingsState.getInstance().state

  if (state.model.isBlank()) {
    return ProviderDiagnosticResult("missing-config", "CodeSetu needs a model before it can send chat requests.")
  }

  return try {
    var text = ""
    val latency = measureTimeMillis {
      text = client.chat(
        messages = listOf(
          ChatMessage("system", "You are CodeSetu diagnostics."),
          ChatMessage("user", "Reply with OK."),
        ),
        maxTokens = 8,
        temperature = 0.0,
      )
    }
    ProviderDiagnosticResult("ok", if (text.isBlank()) "Provider responded." else "Provider responded: $text", latency)
  } catch (error: Exception) {
    ProviderDiagnosticResult("error", error.message ?: error.toString())
  }
}
```

- [ ] **Step 9: Run JetBrains unit tests**

Run:

```bash
cd apps/jetbrains
./gradlew test
```

Expected: PASS for `WorkspaceInstructionsTest`, `PromptBuilderTest`, and `ProviderPayloadTest`. If Gradle downloads the IntelliJ Platform, the first run can take several minutes.

- [ ] **Step 10: Commit JetBrains foundation**

Run:

```bash
git add apps/jetbrains/build.gradle.kts apps/jetbrains/src/main/kotlin apps/jetbrains/src/test/kotlin
git commit -m "feat(jetbrains): add provider and prompt foundation"
```

---

## Task 5: JetBrains Chat Tool Window, Context Collector, and Editor Actions

**Files:**

- Modify: `apps/jetbrains/src/main/resources/META-INF/plugin.xml`
- Modify: `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/OpenChatAction.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/context/IdeContextCollector.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/toolwindow/CodeSetuChatService.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/toolwindow/CodeSetuToolWindowFactory.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/CodeSetuEditorAction.kt`
- Create: `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/DiagnoseProviderAction.kt`

- [ ] **Step 1: Register tool window, settings, and actions**

Modify `apps/jetbrains/src/main/resources/META-INF/plugin.xml`:

```xml
<actions>
  <group id="ai.codesetu.MainMenu" text="CodeSetu" description="CodeSetu actions" popup="true">
    <add-to-group group-id="ToolsMenu" anchor="last"/>
    <action
      id="ai.codesetu.OpenChatAction"
      class="ai.codesetu.actions.OpenChatAction"
      text="Open Chat"
      description="Open the CodeSetu chat panel"/>
    <action
      id="ai.codesetu.DiagnoseProviderAction"
      class="ai.codesetu.actions.DiagnoseProviderAction"
      text="Diagnose Provider"
      description="Test the configured CodeSetu provider"/>
    <action
      id="ai.codesetu.ExplainSelectionAction"
      class="ai.codesetu.actions.ExplainSelectionAction"
      text="Explain Selection"
      description="Explain the selected code"/>
    <action
      id="ai.codesetu.RefactorSelectionAction"
      class="ai.codesetu.actions.RefactorSelectionAction"
      text="Refactor Selection"
      description="Suggest a focused refactor"/>
    <action
      id="ai.codesetu.WriteTestsForSelectionAction"
      class="ai.codesetu.actions.WriteTestsForSelectionAction"
      text="Write Tests for Selection"
      description="Write focused tests for the selected code"/>
    <action
      id="ai.codesetu.FixBugInSelectionAction"
      class="ai.codesetu.actions.FixBugInSelectionAction"
      text="Fix Bug in Selection"
      description="Find and fix a bug in the selected code"/>
    <action
      id="ai.codesetu.AddDocsToSelectionAction"
      class="ai.codesetu.actions.AddDocsToSelectionAction"
      text="Add Docs to Selection"
      description="Add useful documentation for the selected code"/>
  </group>
</actions>

<extensions defaultExtensionNs="com.intellij">
  <toolWindow
    id="CodeSetu"
    anchor="right"
    factoryClass="ai.codesetu.toolwindow.CodeSetuToolWindowFactory"/>
  <applicationConfigurable
    instance="ai.codesetu.settings.CodeSetuSettingsConfigurable"
    displayName="CodeSetu"/>
</extensions>
```

- [ ] **Step 2: Add context collector**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/context/IdeContextCollector.kt`:

```kotlin
package ai.codesetu.context

import ai.codesetu.model.IdeContextPayload
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project

fun collectIdeContext(event: AnActionEvent): IdeContextPayload {
  val editor = event.getData(CommonDataKeys.EDITOR)
    ?: return IdeContextPayload()
  val document = editor.document
  val virtualFile = FileDocumentManager.getInstance().getFile(document)
  val selectionModel = editor.selectionModel
  val text = document.text
  val selectionStart = selectionModel.selectionStart.coerceIn(0, text.length)
  val selectionEnd = selectionModel.selectionEnd.coerceIn(selectionStart, text.length)
  val selectedText = text.substring(selectionStart, selectionEnd)
  val cursorPrefix = text.substring((selectionStart - 2_000).coerceAtLeast(0), selectionStart)
  val cursorSuffix = text.substring(selectionEnd, (selectionEnd + 2_000).coerceAtMost(text.length))

  return IdeContextPayload(
    activeFilePath = virtualFile?.path,
    languageId = virtualFile?.fileType?.name?.lowercase(),
    selectedText = selectedText,
    activeFileText = trimMiddle(text, 12_000),
    cursorPrefix = cursorPrefix,
    cursorSuffix = cursorSuffix,
  )
}

fun collectIdeContext(project: Project): IdeContextPayload {
  val editor = FileEditorManager.getInstance(project).selectedTextEditor
    ?: return IdeContextPayload()
  val document = editor.document
  val virtualFile = FileDocumentManager.getInstance().getFile(document)
  val caretOffset = editor.caretModel.offset.coerceIn(0, document.textLength)
  val text = document.text

  return IdeContextPayload(
    activeFilePath = virtualFile?.path,
    languageId = virtualFile?.fileType?.name?.lowercase(),
    selectedText = editor.selectionModel.selectedText.orEmpty(),
    activeFileText = trimMiddle(text, 12_000),
    cursorPrefix = text.substring((caretOffset - 2_000).coerceAtLeast(0), caretOffset),
    cursorSuffix = text.substring(caretOffset, (caretOffset + 2_000).coerceAtMost(text.length)),
  )
}

private fun trimMiddle(value: String, maxChars: Int): String =
  if (value.length <= maxChars) value else value.take(maxChars / 2) + "\n...[trimmed for context]...\n" + value.takeLast(maxChars / 2)
```

- [ ] **Step 3: Add JetBrains chat service and tool window**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/toolwindow/CodeSetuChatService.kt`:

```kotlin
package ai.codesetu.toolwindow

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

@Service(Service.Level.PROJECT)
class CodeSetuChatService(private val project: Project) {
  private var panel: CodeSetuChatPanel? = null

  fun register(panel: CodeSetuChatPanel) {
    this.panel = panel
  }

  fun sendMessage(text: String) {
    panel?.sendMessage(text)
  }

  companion object {
    fun getInstance(project: Project): CodeSetuChatService =
      project.getService(CodeSetuChatService::class.java)
  }
}
```

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/toolwindow/CodeSetuToolWindowFactory.kt`:

```kotlin
package ai.codesetu.toolwindow

import ai.codesetu.context.collectIdeContext
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.ChatMessage
import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.prompts.buildContextMarkdown
import ai.codesetu.prompts.buildSystemMessage
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTextArea

class CodeSetuToolWindowFactory : ToolWindowFactory {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val panel = CodeSetuChatPanel(project)
    CodeSetuChatService.getInstance(project).register(panel)
    val content = ContentFactory.getInstance().createContent(panel.component, "", false)
    toolWindow.contentManager.addContent(content)
  }
}

class CodeSetuChatPanel(private val project: Project) {
  val component: JPanel = JPanel(BorderLayout())
  private val transcript = JTextArea()
  private val input = JTextArea(4, 40)
  private val send = JButton("Send")
  private val client = CodeSetuProviderClient()

  init {
    transcript.isEditable = false
    component.add(JScrollPane(transcript), BorderLayout.CENTER)
    component.add(JScrollPane(input), BorderLayout.SOUTH)
    component.add(send, BorderLayout.EAST)
    send.addActionListener { sendMessage(input.text) }
  }

  fun sendMessage(text: String) {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return

    append("You", trimmed)
    input.text = ""
    send.isEnabled = false

    ApplicationManager.getApplication().executeOnPooledThread {
      val instructions = loadWorkspaceInstructions(project)
      val ideContext = buildContextMarkdown(collectIdeContext(project))
      val userMessage = if (ideContext.isBlank()) {
        trimmed
      } else {
        "$trimmed\n\nCurrent IDE context:\n\n$ideContext"
      }
      val response = try {
        client.chat(
          listOf(
            ChatMessage("system", buildSystemMessage(instructions)),
            ChatMessage("user", userMessage),
          ),
        )
      } catch (error: Exception) {
        "CodeSetu could not complete that request: ${error.message ?: error}"
      }

      ApplicationManager.getApplication().invokeLater {
        append("CodeSetu", response)
        send.isEnabled = true
      }
    }
  }

  private fun append(role: String, text: String) {
    transcript.append("$role:\n$text\n\n")
  }
}
```

- [ ] **Step 4: Open real tool window from OpenChatAction**

Modify `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/OpenChatAction.kt`:

```kotlin
package ai.codesetu.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager

class OpenChatAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    ToolWindowManager.getInstance(project).getToolWindow("CodeSetu")?.show()
  }
}
```

- [ ] **Step 5: Add provider diagnostics action**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/DiagnoseProviderAction.kt`:

```kotlin
package ai.codesetu.actions

import ai.codesetu.provider.runProviderDiagnostic
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.Messages

class DiagnoseProviderAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return

    ApplicationManager.getApplication().executeOnPooledThread {
      val result = runProviderDiagnostic()
      ApplicationManager.getApplication().invokeLater {
        if (result.status == "ok") {
          Messages.showInfoMessage(
            project,
            "CodeSetu provider connection succeeded in ${result.latencyMs ?: 0}ms.",
            "CodeSetu",
          )
        } else {
          Messages.showWarningDialog(project, result.message, "CodeSetu Provider Diagnostic")
        }
      }
    }
  }
}
```

- [ ] **Step 6: Add selected-code actions**

Create `apps/jetbrains/src/main/kotlin/ai/codesetu/actions/CodeSetuEditorAction.kt`:

```kotlin
package ai.codesetu.actions

import ai.codesetu.context.collectIdeContext
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.IdeActionId
import ai.codesetu.prompts.buildActionUserMessage
import ai.codesetu.toolwindow.CodeSetuChatService
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager

abstract class CodeSetuEditorAction(
  private val actionId: IdeActionId,
) : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val message = buildActionUserMessage(actionId, collectIdeContext(e), loadWorkspaceInstructions(project))
    val toolWindow = ToolWindowManager.getInstance(project).getToolWindow("CodeSetu") ?: return
    toolWindow.show {
      CodeSetuChatService.getInstance(project).sendMessage(message)
    }
  }
}

class ExplainSelectionAction : CodeSetuEditorAction(IdeActionId.EXPLAIN)
class RefactorSelectionAction : CodeSetuEditorAction(IdeActionId.REFACTOR)
class WriteTestsForSelectionAction : CodeSetuEditorAction(IdeActionId.WRITE_TESTS)
class FixBugInSelectionAction : CodeSetuEditorAction(IdeActionId.FIX_BUG)
class AddDocsToSelectionAction : CodeSetuEditorAction(IdeActionId.ADD_DOCS)
```

- [ ] **Step 7: Run JetBrains build**

Run:

```bash
cd apps/jetbrains
./gradlew test buildPlugin
```

Expected: unit tests pass and `build/distributions/codesetu-jetbrains-*.zip` is created.

- [ ] **Step 8: Commit JetBrains UI and actions**

Run:

```bash
git add apps/jetbrains/src/main/kotlin apps/jetbrains/src/main/resources/META-INF/plugin.xml
git commit -m "feat(jetbrains): add chat tool window and editor actions"
```

---

## Task 6: Documentation and Full Verification

**Files:**

- Modify: `README.md`
- Modify: `INSTALL.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `apps/vscode/README.md`
- Modify: `apps/jetbrains/README.md`

- [ ] **Step 1: Update top-level README feature list**

Modify `README.md` feature/status sections to include:

```markdown
**Highlights**: AI chat in IDE · Repo-aware context · Selected-code actions ·
Inline (FIM) code completions · Provider setup and diagnostics · Workspace
skills/checks · Air-gapped friendly · Hindi / Indic-aware · Plugin + skill SDK ·
100% open-source (Apache 2.0)
```

Update app bullets:

```markdown
- `apps/vscode` — VS Code extension with chat, repo-aware context, selected-code actions, setup diagnostics, and inline completions
- `apps/jetbrains` — JetBrains plugin with chat, selected-code actions, provider settings, and diagnostics
```

- [ ] **Step 2: Update VS Code README**

Modify `apps/vscode/README.md` features:

```markdown
## Features

- `CodeSetu: Open Chat` command
- Repo-aware chat context from the active editor and workspace snippets
- Selected-code actions: Explain, Refactor, Write Tests, Fix Bug, Add Docs
- `CodeSetu: Setup Provider` guided provider configuration
- `CodeSetu: Diagnose Provider` connection test and friendly errors
- Inline completions for code files
- Sarvam provider support
- Generic OpenAI-compatible provider support for Ollama, OpenRouter, vLLM,
  SGLang, and similar endpoints
- Workspace skills/checks from `.codesetu/skills/*.md` and `.codesetu/checks/*.md`
```

- [ ] **Step 3: Update JetBrains README**

Modify `apps/jetbrains/README.md` status/features:

```markdown
## Features

- `Tools -> CodeSetu -> Open Chat`
- CodeSetu tool window with provider-backed chat
- Selected-code actions: Explain, Refactor, Write Tests, Fix Bug, Add Docs
- Provider settings for Sarvam and OpenAI-compatible APIs
- Provider diagnostics for missing model, failed connection, and successful connection
- Workspace skills/checks from `.codesetu/skills/*.md` and `.codesetu/checks/*.md`
```

- [ ] **Step 4: Update architecture docs**

Modify `docs/ARCHITECTURE.md` to add:

```markdown
## IDE feature foundation

CodeSetu hosts share a language-neutral IDE assistant contract:

- action ids for Explain, Refactor, Write Tests, Fix Bug, and Add Docs
- bounded editor context with selection, active file, cursor neighborhood, and workspace snippets
- provider diagnostics with missing-config, ok, and error states
- workspace skills and checks loaded from `.codesetu/skills/*.md` and `.codesetu/checks/*.md`

VS Code imports the TypeScript implementation from `@codesetu/core`. JetBrains
mirrors the same payload shapes in Kotlin so it can run without a Node.js
sidecar.
```

- [ ] **Step 5: Update install docs**

Modify `INSTALL.md` to include provider setup commands:

```markdown
### VS Code guided setup

Run `CodeSetu: Setup Provider` from the command palette, choose Sarvam or
OpenAI-compatible, enter the base URL, model, and API key, then run
`CodeSetu: Diagnose Provider`.

### JetBrains guided setup

Open `Settings -> Tools -> CodeSetu`, enter provider, base URL, model, and API
key, then use the CodeSetu diagnostics action from the Tools menu.
```

- [ ] **Step 6: Run full TypeScript verification**

Run:

```bash
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 7: Run JetBrains verification**

Run:

```bash
cd apps/jetbrains
./gradlew test buildPlugin
```

Expected: Gradle exits 0 and produces a plugin zip under `apps/jetbrains/build/distributions/`.

- [ ] **Step 8: Commit docs and verification fixes**

Run:

```bash
git add README.md INSTALL.md docs/ARCHITECTURE.md apps/vscode/README.md apps/jetbrains/README.md
git commit -m "docs: describe IDE feature foundation"
```

---

## Self-Review

Spec coverage:

- Real JetBrains chat is covered by Tasks 4 and 5.
- Repo-aware context is covered by Tasks 1, 2, and 5.
- Selected-code actions are covered by Tasks 1, 2, and 5.
- Provider setup and diagnostics are covered by Tasks 1, 3, and 4.
- Workspace skills/checks are covered by Tasks 1, 2, 4, and 6.
- Documentation and verification are covered by Task 6.

Completeness scan:

- The plan has no open-ended implementation notes or incomplete sections.
- Each task names exact files, test commands, expected outcomes, and commit commands.

Type consistency:

- TypeScript uses `IdeActionId`, `IdeContextPayload`, `WorkspaceInstruction`, and `ProviderDiagnostic`.
- Kotlin mirrors `IdeActionId`, `IdeContextPayload`, and `WorkspaceInstruction`.
- Action ids match across TypeScript, VS Code command names, Kotlin enum values, and JetBrains action classes.
