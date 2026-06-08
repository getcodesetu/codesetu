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

import type { AgentHost } from "./host.js";

/**
 * Whether a tool only observes the workspace ("safe", auto-approved) or
 * changes it / runs commands ("mutating", requires user approval). The agent
 * loop uses this to decide when to call the approval gate.
 */
export type ToolRisk = "safe" | "mutating";

export interface ToolResult {
  /** Text fed back to the model as the tool message content. */
  content: string;
  /** True when the call failed; the model still sees `content` (the error). */
  isError?: boolean;
}

export interface AgentToolContext {
  host: AgentHost;
  signal?: AbortSignal;
}

export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema describing the function arguments. */
  parameters: Record<string, unknown>;
  risk: ToolRisk;
  execute(args: Record<string, unknown>, ctx: AgentToolContext): Promise<ToolResult>;
}

/** Cap tool output so a single call can't blow the model's context window. */
export const MAX_TOOL_OUTPUT_CHARS = 30_000;
/** Default wall-clock limit for a single Bash command. */
export const DEFAULT_BASH_TIMEOUT_MS = 120_000;

function truncate(text: string, limit = MAX_TOOL_OUTPUT_CHARS): string {
  if (text.length <= limit) {
    return text;
  }
  const omitted = text.length - limit;
  return `${text.slice(0, limit)}\n... [truncated ${omitted} characters]`;
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string argument "${key}".`);
  }
  return value;
}

function optionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function ok(content: string): ToolResult {
  return { content };
}

function fail(content: string): ToolResult {
  return { content, isError: true };
}

/** Read a text file, optionally a line range, returned with line numbers. */
export const READ_TOOL: AgentTool = {
  name: "read_file",
  description:
    "Read a UTF-8 text file from the workspace. Returns the contents with line " +
    "numbers. Use offset/limit to read a slice of a large file.",
  risk: "safe",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["path"],
    properties: {
      path: { type: "string", description: "Workspace-relative or absolute file path." },
      offset: { type: "number", description: "1-based line to start at (default 1)." },
      limit: { type: "number", description: "Maximum number of lines to read." },
    },
  },
  async execute(args, { host }) {
    const path = requireString(args, "path");
    let content: string;
    try {
      content = await host.readFile(path);
    } catch (error) {
      return fail(`Could not read ${path}: ${errorMessage(error)}`);
    }

    const lines = content.split("\n");
    const offset = Math.max(1, optionalNumber(args, "offset") ?? 1);
    const limit = optionalNumber(args, "limit");
    const start = offset - 1;
    const end = limit === undefined ? lines.length : start + limit;
    const selected = lines.slice(start, end);

    if (selected.length === 0) {
      return ok(`${path} is empty or the requested range is out of bounds.`);
    }

    const numbered = selected
      .map((line, index) => `${String(start + index + 1).padStart(6)}\t${line}`)
      .join("\n");
    return ok(truncate(numbered));
  },
};

/** Create or overwrite a file with the given contents. */
export const WRITE_TOOL: AgentTool = {
  name: "write_file",
  description:
    "Create a new file or overwrite an existing one with the given contents. " +
    "Parent directories are created as needed.",
  risk: "mutating",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["path", "content"],
    properties: {
      path: { type: "string", description: "Workspace-relative or absolute file path." },
      content: { type: "string", description: "Full UTF-8 contents to write." },
    },
  },
  async execute(args, { host }) {
    const path = requireString(args, "path");
    const content = typeof args.content === "string" ? args.content : "";
    try {
      await host.writeFile(path, content);
    } catch (error) {
      return fail(`Could not write ${path}: ${errorMessage(error)}`);
    }
    const lineCount = content.length === 0 ? 0 : content.split("\n").length;
    return ok(`Wrote ${path} (${lineCount} lines, ${content.length} characters).`);
  },
};

/** Replace an exact substring in a file. */
export const EDIT_TOOL: AgentTool = {
  name: "edit_file",
  description:
    "Replace an exact string in a file. `old_string` must appear exactly once " +
    "unless replace_all is true. Use this for surgical changes instead of " +
    "rewriting the whole file.",
  risk: "mutating",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["path", "old_string", "new_string"],
    properties: {
      path: { type: "string", description: "Workspace-relative or absolute file path." },
      old_string: { type: "string", description: "Exact text to replace." },
      new_string: { type: "string", description: "Replacement text." },
      replace_all: {
        type: "boolean",
        description: "Replace every occurrence instead of requiring uniqueness.",
      },
    },
  },
  async execute(args, { host }) {
    const path = requireString(args, "path");
    const oldString = requireString(args, "old_string");
    const newString = typeof args.new_string === "string" ? args.new_string : "";
    const replaceAll = args.replace_all === true;

    if (oldString === newString) {
      return fail("old_string and new_string are identical; nothing to change.");
    }

    let content: string;
    try {
      content = await host.readFile(path);
    } catch (error) {
      return fail(`Could not read ${path}: ${errorMessage(error)}`);
    }

    const occurrences = countOccurrences(content, oldString);
    if (occurrences === 0) {
      return fail(`old_string was not found in ${path}.`);
    }
    if (occurrences > 1 && !replaceAll) {
      return fail(
        `old_string appears ${occurrences} times in ${path}; make it unique or set replace_all.`,
      );
    }

    const updated = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    try {
      await host.writeFile(path, updated);
    } catch (error) {
      return fail(`Could not write ${path}: ${errorMessage(error)}`);
    }
    const replaced = replaceAll ? occurrences : 1;
    return ok(`Edited ${path} (${replaced} replacement${replaced === 1 ? "" : "s"}).`);
  },
};

/** Run a shell command in the workspace root. */
export const BASH_TOOL: AgentTool = {
  name: "bash",
  description:
    "Run a shell command in the workspace root and return its combined output. " +
    "Use this for tests, builds, git, search, and anything the terminal can do.",
  risk: "mutating",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["command"],
    properties: {
      command: { type: "string", description: "The shell command to run." },
      timeout_ms: {
        type: "number",
        description: `Timeout in milliseconds (default ${DEFAULT_BASH_TIMEOUT_MS}).`,
      },
    },
  },
  async execute(args, { host, signal }) {
    const command = requireString(args, "command");
    const timeoutMs = optionalNumber(args, "timeout_ms") ?? DEFAULT_BASH_TIMEOUT_MS;

    let result;
    try {
      result = await host.exec(command, {
        timeoutMs,
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      return fail(`Command failed to start: ${errorMessage(error)}`);
    }

    const sections: string[] = [];
    if (result.stdout.length > 0) {
      sections.push(result.stdout.trimEnd());
    }
    if (result.stderr.length > 0) {
      sections.push(`[stderr]\n${result.stderr.trimEnd()}`);
    }
    const body = sections.length > 0 ? sections.join("\n\n") : "(no output)";
    const status = `[exit code: ${result.exitCode ?? "killed"}]`;
    const content = truncate(`${body}\n${status}`);
    return result.exitCode === 0 ? ok(content) : fail(content);
  },
};

/** The four primitive tools, in the order they're presented to the model. */
export const DEFAULT_AGENT_TOOLS: readonly AgentTool[] = [
  READ_TOOL,
  WRITE_TOOL,
  EDIT_TOOL,
  BASH_TOOL,
];

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
