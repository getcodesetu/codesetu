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

import { beforeEach, describe, expect, it } from "vitest";

import { activate } from "../src/extension";
import {
  __reset,
  inlineCompletionProviderCount,
  registeredCommands,
  registeredContentSchemes,
} from "../test-support/vscodeMock";

function fakeContext(): unknown {
  const noopMemento = { get: () => undefined, update: async () => undefined, keys: () => [] };
  return {
    subscriptions: [] as unknown[],
    secrets: {
      get: async () => undefined,
      store: async () => undefined,
      delete: async () => undefined,
      onDidChange: () => ({ dispose: () => undefined }),
    },
    workspaceState: noopMemento,
    globalState: { ...noopMemento, setKeysForSync: () => undefined },
    extensionUri: { path: "/ext", fsPath: "/ext", scheme: "file", toString: () => "/ext" },
    extensionPath: "/ext",
  };
}

describe("extension activation (headless, mocked vscode)", () => {
  beforeEach(() => {
    __reset();
  });

  it("activates without throwing and registers every command + provider", async () => {
    const context = fakeContext();

    await expect(activate(context as never)).resolves.toBeUndefined();

    // All commands the extension contributes should be registered at activation.
    expect(registeredCommands).toEqual(
      expect.arrayContaining([
        "codesetu.openChat",
        "codesetu.newChat",
        "codesetu.setupProvider",
        "codesetu.setupSpeechProvider",
        "codesetu.diagnoseProvider",
        "codesetu.selectModel",
        "codesetu.revertLastAgentEdits",
        "codesetu.editSelection",
        "codesetu.explainSelection",
        "codesetu.refactorSelection",
        "codesetu.writeTestsForSelection",
        "codesetu.fixBugInSelection",
        "codesetu.addDocsToSelection",
      ]),
    );

    // The /edit feature serves its diff via this content-provider scheme.
    expect(registeredContentSchemes).toContain("codesetu-edit");

    // Inline completions are wired up exactly once.
    expect(inlineCompletionProviderCount).toBe(1);

    // Everything registered is pushed to subscriptions for disposal.
    expect((context as { subscriptions: unknown[] }).subscriptions.length).toBeGreaterThan(0);
  });

  it("registers the package.json commands that have a runtime handler", async () => {
    await activate(fakeContext() as never);

    // Cross-check: every command contributed in package.json is registered at
    // runtime, so the manifest and activation can't silently drift apart.
    const manifest = (await import("../package.json")) as unknown as {
      contributes: { commands: Array<{ command: string }> };
    };
    for (const { command } of manifest.contributes.commands) {
      expect(registeredCommands).toContain(command);
    }
  });
});
