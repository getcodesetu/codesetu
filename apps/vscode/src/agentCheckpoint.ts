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
import path from "node:path";

import type { AgentHost } from "@codesetu/core";

/** Original state of a file before the agent first wrote to it in a turn. */
type Snapshot = { absPath: string; relPath: string; original: string | null };

export interface RevertResult {
  restored: number;
  deleted: number;
  failed: number;
}

/**
 * Records the pre-edit state of every file the agent writes during a turn, so
 * the whole turn's file changes can be undone in one click.
 *
 * Scope: this captures structured edits (write_file / edit_file, which both go
 * through host.writeFile). Side effects of `bash` commands are NOT tracked and
 * cannot be reverted this way.
 */
export class WorkspaceCheckpoint {
  // Keyed by resolved absolute path; only the FIRST snapshot per file is kept,
  // so revert restores the state from before the turn began.
  private readonly snapshots = new Map<string, Snapshot>();

  public async capture(absPath: string, relPath: string): Promise<void> {
    if (this.snapshots.has(absPath)) {
      return;
    }
    let original: string | null;
    try {
      original = await fs.readFile(absPath, "utf8");
    } catch {
      // Treat unreadable/non-existent as "did not exist" — revert deletes it.
      original = null;
    }
    this.snapshots.set(absPath, { absPath, relPath, original });
  }

  public isEmpty(): boolean {
    return this.snapshots.size === 0;
  }

  public changedFiles(): string[] {
    return [...this.snapshots.values()].map((snapshot) => snapshot.relPath).sort();
  }

  /** Restore every captured file to its pre-turn state. */
  public async revert(): Promise<RevertResult> {
    const result: RevertResult = { restored: 0, deleted: 0, failed: 0 };
    for (const snapshot of this.snapshots.values()) {
      try {
        if (snapshot.original === null) {
          await fs.rm(snapshot.absPath, { force: true });
          result.deleted += 1;
        } else {
          await fs.mkdir(path.dirname(snapshot.absPath), { recursive: true });
          await fs.writeFile(snapshot.absPath, snapshot.original, "utf8");
          result.restored += 1;
        }
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }
}

/**
 * Wrap an AgentHost so each write is snapshotted into `checkpoint` before it
 * lands. The returned host is otherwise identical to the one passed in.
 */
export function createCheckpointingHost(
  host: AgentHost,
  root: string | undefined,
): { host: AgentHost; checkpoint: WorkspaceCheckpoint } {
  const base = root ?? process.cwd();
  const checkpoint = new WorkspaceCheckpoint();

  const wrapped: AgentHost = {
    ...host,
    async writeFile(filePath: string, content: string): Promise<void> {
      const absPath = path.resolve(base, filePath);
      const relPath = path.relative(base, absPath) || filePath;
      await checkpoint.capture(absPath, relPath);
      await host.writeFile(filePath, content);
    },
  };

  return { host: wrapped, checkpoint };
}
