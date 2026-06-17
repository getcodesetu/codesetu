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

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { AgentHost } from "@codesetu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCheckpointingHost } from "../src/agentCheckpoint";

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "codesetu-checkpoint-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

// Minimal host that just writes to disk under root — enough to exercise the
// snapshot/revert wrapper without pulling in vscode.
function diskHost(base: string): AgentHost {
  return {
    rootPath: () => base,
    async readFile(filePath) {
      return fs.readFile(path.resolve(base, filePath), "utf8");
    },
    async writeFile(filePath, content) {
      const resolved = path.resolve(base, filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");
    },
    async exec() {
      return { stdout: "", stderr: "", exitCode: 0 };
    },
    async glob() {
      return [];
    },
    async listDir() {
      return [];
    },
  };
}

describe("createCheckpointingHost", () => {
  it("restores an existing file's pre-turn content on revert", async () => {
    await fs.writeFile(path.join(root, "a.txt"), "original", "utf8");
    const { host, checkpoint } = createCheckpointingHost(diskHost(root), root);

    await host.writeFile("a.txt", "changed once");
    await host.writeFile("a.txt", "changed twice");

    expect(checkpoint.changedFiles()).toEqual(["a.txt"]);
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("changed twice");

    const result = await checkpoint.revert();
    expect(result).toEqual({ restored: 1, deleted: 0, failed: 0 });
    expect(await fs.readFile(path.join(root, "a.txt"), "utf8")).toBe("original");
  });

  it("deletes a file the agent newly created when reverting", async () => {
    const { host, checkpoint } = createCheckpointingHost(diskHost(root), root);

    await host.writeFile("nested/new.txt", "brand new");
    expect(await fs.readFile(path.join(root, "nested/new.txt"), "utf8")).toBe("brand new");

    const result = await checkpoint.revert();
    expect(result).toEqual({ restored: 0, deleted: 1, failed: 0 });
    await expect(fs.readFile(path.join(root, "nested/new.txt"), "utf8")).rejects.toThrow();
  });

  it("reports an empty checkpoint when nothing was written", () => {
    const { checkpoint } = createCheckpointingHost(diskHost(root), root);
    expect(checkpoint.isEmpty()).toBe(true);
  });
});
