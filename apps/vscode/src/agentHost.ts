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

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { AgentHost, DirEntry, ExecOptions, ExecResult } from "@codesetu/core";
import * as vscode from "vscode";

/** Cap glob results so a single call can't flood the model's context. */
const MAX_GLOB_FILES = 1_000;

/**
 * Node-backed AgentHost for the VSCode extension host. It owns the sandbox:
 * every path is resolved against (and contained within) the workspace root, and
 * commands run from that root. The agent tools call these primitives but never
 * touch the filesystem or shell directly, so the containment lives in one place.
 */
export function createNodeAgentHost(root: string | undefined): AgentHost {
  const base = root ?? process.cwd();

  const resolveWithinRoot = (relativeOrAbsolute: string): string => {
    const resolved = path.resolve(base, relativeOrAbsolute);
    const contained = resolved === base || resolved.startsWith(base + path.sep);
    if (!contained) {
      throw new Error(`Path escapes the workspace root: ${relativeOrAbsolute}`);
    }
    return resolved;
  };

  return {
    rootPath: () => root,
    async readFile(filePath: string): Promise<string> {
      return fs.readFile(resolveWithinRoot(filePath), "utf8");
    },
    async writeFile(filePath: string, content: string): Promise<void> {
      const resolved = resolveWithinRoot(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");
    },
    exec(command: string, options?: ExecOptions): Promise<ExecResult> {
      return runShellCommand(command, base, options);
    },
    async glob(pattern: string): Promise<readonly string[]> {
      // findFiles respects the workspace's files.exclude/search.exclude, so
      // .git, node_modules, build output, etc. are skipped for free.
      const uris = await vscode.workspace.findFiles(pattern, undefined, MAX_GLOB_FILES);
      return uris
        .map((uri) => path.relative(base, uri.fsPath))
        .filter((relative) => !relative.startsWith(".."))
        .sort();
    },
    async listDir(dirPath: string): Promise<readonly DirEntry[]> {
      const resolved = resolveWithinRoot(dirPath);
      const dirents = await fs.readdir(resolved, { withFileTypes: true });
      return dirents.map((dirent) => ({
        name: dirent.name,
        type: dirent.isDirectory() ? "directory" : "file",
      }));
    },
  };
}

function runShellCommand(command: string, cwd: string, options?: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, cwd: options?.cwd ?? cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeoutMs = options?.timeoutMs;
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, timeoutMs);

    const onAbort = (): void => {
      child.kill("SIGKILL");
    };
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (exitCode: number | null): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      options?.signal?.removeEventListener("abort", onAbort);
      if (timedOut) {
        stderr += `${stderr.length > 0 ? "\n" : ""}[timed out after ${String(timeoutMs)}ms]`;
      }
      resolve({ stdout, stderr, exitCode });
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: Error) => {
      stderr += `${stderr.length > 0 ? "\n" : ""}${error.message}`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
