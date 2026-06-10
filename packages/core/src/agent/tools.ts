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

import { diffLines } from "./diff.js";
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
  /**
   * Optional human-readable preview of the change this call would make (e.g. a
   * diff), shown in the approval prompt. Returns undefined if there's nothing
   * useful to preview.
   */
  preview?(args: Record<string, unknown>, ctx: AgentToolContext): Promise<string | undefined>;
}

/** Cap tool output so a single call can't blow the model's context window. */
export const MAX_TOOL_OUTPUT_CHARS = 30_000;
/** Default wall-clock limit for a single Bash command. */
export const DEFAULT_BASH_TIMEOUT_MS = 120_000;
/** Caps for the read-only search tools so they stay bounded on large repos. */
export const MAX_GLOB_RESULTS = 200;
export const MAX_GREP_FILES = 1_000;
export const MAX_GREP_MATCHES = 200;

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
  async preview(args, { host }) {
    const path = typeof args.path === "string" ? args.path : "?";
    const content = typeof args.content === "string" ? args.content : "";
    let current = "";
    let exists = true;
    try {
      current = await host.readFile(path);
    } catch {
      exists = false;
    }
    const verb = exists ? "Overwrite" : "Create";
    return `${verb} ${path}\n\n${diffLines(current, content)}`;
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
  preview(args) {
    const path = typeof args.path === "string" ? args.path : "?";
    const oldString = typeof args.old_string === "string" ? args.old_string : "";
    const newString = typeof args.new_string === "string" ? args.new_string : "";
    return Promise.resolve(`Edit ${path}\n\n${diffLines(oldString, newString)}`);
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

/** List files matching a glob pattern. */
export const GLOB_TOOL: AgentTool = {
  name: "glob",
  description:
    'Find files whose path matches a glob pattern (e.g. "src/**/*.ts"). ' +
    "Returns matching workspace-relative paths.",
  risk: "safe",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["pattern"],
    properties: {
      pattern: { type: "string", description: "Glob pattern relative to the workspace root." },
    },
  },
  async execute(args, { host }) {
    const pattern = requireString(args, "pattern");
    let paths: readonly string[];
    try {
      paths = await host.glob(pattern);
    } catch (error) {
      return fail(`glob failed: ${errorMessage(error)}`);
    }
    if (paths.length === 0) {
      return ok(`No files match ${pattern}.`);
    }
    const capped = paths.slice(0, MAX_GLOB_RESULTS);
    const more =
      paths.length > capped.length ? `\n... and ${paths.length - capped.length} more` : "";
    return ok(truncate(capped.join("\n") + more));
  },
};

/** List the entries of a directory. */
export const LIST_TOOL: AgentTool = {
  name: "list_dir",
  description: "List the files and subdirectories of a directory (defaults to the workspace root).",
  risk: "safe",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: [],
    properties: {
      path: { type: "string", description: "Directory path (default: workspace root)." },
    },
  },
  async execute(args, { host }) {
    const path = typeof args.path === "string" && args.path.length > 0 ? args.path : ".";
    let entries;
    try {
      entries = await host.listDir(path);
    } catch (error) {
      return fail(`Could not list ${path}: ${errorMessage(error)}`);
    }
    if (entries.length === 0) {
      return ok(`${path} is empty.`);
    }
    const rendered = entries
      .map((entry) => (entry.type === "directory" ? `${entry.name}/` : entry.name))
      .sort()
      .join("\n");
    return ok(truncate(rendered));
  },
};

/** Search file contents for a regular expression. */
export const GREP_TOOL: AgentTool = {
  name: "grep",
  description:
    "Search file contents for a regular expression. Returns matches as " +
    '"path:line: text". Narrow the search with the glob argument.',
  risk: "safe",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["pattern"],
    properties: {
      pattern: { type: "string", description: "Regular expression to search for." },
      glob: {
        type: "string",
        description: 'Glob limiting which files are searched (default "**/*").',
      },
      case_insensitive: { type: "boolean", description: "Match case-insensitively." },
    },
  },
  async execute(args, { host }) {
    const pattern = requireString(args, "pattern");
    const globPattern = typeof args.glob === "string" && args.glob.length > 0 ? args.glob : "**/*";
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, args.case_insensitive === true ? "i" : "");
    } catch (error) {
      return fail(`Invalid regular expression: ${errorMessage(error)}`);
    }

    let files: readonly string[];
    try {
      files = await host.glob(globPattern);
    } catch (error) {
      return fail(`grep failed: ${errorMessage(error)}`);
    }

    const results: string[] = [];
    let scanned = 0;
    for (const file of files) {
      if (scanned >= MAX_GREP_FILES || results.length >= MAX_GREP_MATCHES) {
        break;
      }
      scanned += 1;
      let content: string;
      try {
        content = await host.readFile(file);
      } catch {
        continue; // unreadable (deleted, permissions) — skip
      }
      if (content.includes("\u0000")) {
        continue; // looks binary
      }
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line !== undefined && regex.test(line)) {
          results.push(`${file}:${i + 1}: ${line.trim()}`);
          if (results.length >= MAX_GREP_MATCHES) {
            break;
          }
        }
      }
    }

    if (results.length === 0) {
      return ok(`No matches for /${pattern}/.`);
    }
    const note =
      results.length >= MAX_GREP_MATCHES ? `\n... (stopped at ${MAX_GREP_MATCHES} matches)` : "";
    return ok(truncate(results.join("\n") + note));
  },
};

/** Record/update the agent's task list for the current job. */
export const TODO_WRITE_TOOL: AgentTool = {
  name: "todo_write",
  description:
    "Record or update your task list for this job. Pass the full list each " +
    "time. Use it to plan and track multi-step work so you don't lose the thread.",
  risk: "safe",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["todos"],
    properties: {
      todos: {
        type: "array",
        description: "The full task list.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["content", "status"],
          properties: {
            content: { type: "string" },
            status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          },
        },
      },
    },
  },
  execute(args) {
    const todos = Array.isArray(args.todos) ? args.todos : [];
    if (todos.length === 0) {
      return Promise.resolve(ok("Task list cleared."));
    }
    const rendered = todos
      .map((todo) => {
        const item = todo as { content?: unknown; status?: unknown };
        const content = typeof item.content === "string" ? item.content : String(item.content);
        const marker =
          item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[~]" : "[ ]";
        return `${marker} ${content}`;
      })
      .join("\n");
    return Promise.resolve(ok(rendered));
  },
};

/**
 * The agent's tools, in the order they're presented to the model: the four
 * primitives plus the read-only helpers (auto-approved) that lift quality on
 * smaller models without the model fumbling shell flags.
 */
export const DEFAULT_AGENT_TOOLS: readonly AgentTool[] = [
  READ_TOOL,
  LIST_TOOL,
  GLOB_TOOL,
  GREP_TOOL,
  WRITE_TOOL,
  EDIT_TOOL,
  BASH_TOOL,
  TODO_WRITE_TOOL,
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
