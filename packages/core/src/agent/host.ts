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

export interface ExecResult {
  stdout: string;
  stderr: string;
  /** Process exit code, or null if the process was killed by a signal. */
  exitCode: number | null;
}

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface DirEntry {
  name: string;
  type: "file" | "directory";
}

/**
 * Filesystem and shell primitives an embedding host (VSCode, JetBrains, CLI)
 * provides to agent tools. The host owns sandboxing: it resolves and contains
 * paths against the workspace root and runs commands inside it. Keeping these
 * raw primitives behind an interface keeps the agent loop and the tools
 * host-agnostic and unit-testable — the tools add the editing semantics, path
 * handling, and output shaping on top.
 */
export interface AgentHost {
  /** Absolute workspace root, or undefined for ad-hoc sessions. */
  rootPath(): string | undefined;
  /** Read a UTF-8 text file. `path` may be absolute or workspace-relative. */
  readFile(path: string): Promise<string>;
  /** Write a UTF-8 text file, creating parent directories as needed. */
  writeFile(path: string, content: string): Promise<void>;
  /** Run a shell command. The host enforces cwd (workspace root) and timeout. */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  /** List workspace-relative paths matching a glob (e.g. "src/**\/*.ts"). */
  glob(pattern: string): Promise<readonly string[]>;
  /** List the entries of a directory (path relative to the root or absolute). */
  listDir(path: string): Promise<readonly DirEntry[]>;
}
