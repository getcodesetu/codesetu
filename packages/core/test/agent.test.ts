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

import type { ChatCompletion } from "openai/resources/chat/completions";
import { describe, expect, it, vi } from "vitest";

import {
  BASH_TOOL,
  DEFAULT_AGENT_TOOLS,
  EDIT_TOOL,
  GLOB_TOOL,
  GREP_TOOL,
  LIST_TOOL,
  READ_TOOL,
  TODO_WRITE_TOOL,
  WRITE_TOOL,
  runAgentLoop,
  type AgentEvent,
  type AgentHost,
  type ChatMessage,
  type DirEntry,
  type ExecResult,
  type LlmProvider,
} from "../src/index.js";

class FakeHost implements AgentHost {
  public files = new Map<string, string>();
  public execResult: ExecResult = { stdout: "", stderr: "", exitCode: 0 };
  public execCalls: string[] = [];

  public rootPath(): string {
    return "/workspace";
  }

  public readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      return Promise.reject(new Error("ENOENT"));
    }
    return Promise.resolve(content);
  }

  public writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
    return Promise.resolve();
  }

  public exec(command: string): Promise<ExecResult> {
    this.execCalls.push(command);
    return Promise.resolve(this.execResult);
  }

  public glob(pattern: string): Promise<readonly string[]> {
    const keys = [...this.files.keys()];
    if (pattern === "**/*") {
      return Promise.resolve(keys);
    }
    const regex = new RegExp(
      "^" +
        pattern
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*\//g, "(.*/)?")
          .replace(/\*/g, "[^/]*") +
        "$",
    );
    return Promise.resolve(keys.filter((key) => regex.test(key)));
  }

  public listDir(path: string): Promise<readonly DirEntry[]> {
    const prefix = path === "." || path === "" ? "" : `${path.replace(/\/$/, "")}/`;
    const names = new Set<string>();
    const entries: DirEntry[] = [];
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      const name = slash === -1 ? rest : rest.slice(0, slash);
      if (name.length === 0 || names.has(name)) {
        continue;
      }
      names.add(name);
      entries.push({ name, type: slash === -1 ? "file" : "directory" });
    }
    return Promise.resolve(entries);
  }
}

/** A provider that replays a scripted list of completions, one per turn. */
function scriptedProvider(completions: ChatCompletion[]): LlmProvider {
  let turn = 0;
  return {
    chat(): Promise<ChatCompletion> {
      const completion = completions[turn];
      turn += 1;
      if (completion === undefined) {
        throw new Error("scriptedProvider ran out of completions");
      }
      return Promise.resolve(completion);
    },
    streamChat() {
      throw new Error("not used");
    },
    completeFim() {
      throw new Error("not used");
    },
  };
}

function toolCallCompletion(
  calls: Array<{ id: string; name: string; args: unknown }>,
): ChatCompletion {
  return {
    id: "c",
    object: "chat.completion",
    created: 0,
    model: "test",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        logprobs: null,
        message: {
          role: "assistant",
          content: "",
          refusal: null,
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: "function" as const,
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        },
      },
    ],
  };
}

function textCompletion(text: string): ChatCompletion {
  return {
    id: "c",
    object: "chat.completion",
    created: 0,
    model: "test",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        logprobs: null,
        message: { role: "assistant", content: text, refusal: null },
      },
    ],
  };
}

const baseMessages: ChatMessage[] = [{ role: "user", content: "do the thing" }];
const approveAll = () => Promise.resolve("approve" as const);

describe("agent tools", () => {
  it("read_file returns numbered lines", async () => {
    const host = new FakeHost();
    host.files.set("a.txt", "alpha\nbeta");
    const result = await READ_TOOL.execute({ path: "a.txt" }, { host });
    expect(result.content).toContain("1\talpha");
    expect(result.content).toContain("2\tbeta");
  });

  it("read_file honours offset and limit", async () => {
    const host = new FakeHost();
    host.files.set("a.txt", "one\ntwo\nthree\nfour");
    const result = await READ_TOOL.execute({ path: "a.txt", offset: 2, limit: 2 }, { host });
    expect(result.content).toContain("2\ttwo");
    expect(result.content).toContain("3\tthree");
    expect(result.content).not.toContain("four");
  });

  it("write_file creates a file", async () => {
    const host = new FakeHost();
    const result = await WRITE_TOOL.execute({ path: "new.txt", content: "hi\nthere" }, { host });
    expect(result.isError).toBeUndefined();
    expect(host.files.get("new.txt")).toBe("hi\nthere");
  });

  it("edit_file replaces a unique occurrence", async () => {
    const host = new FakeHost();
    host.files.set("a.txt", "const x = 1;");
    const result = await EDIT_TOOL.execute(
      { path: "a.txt", old_string: "1", new_string: "2" },
      { host },
    );
    expect(result.isError).toBeUndefined();
    expect(host.files.get("a.txt")).toBe("const x = 2;");
  });

  it("edit_file refuses an ambiguous match without replace_all", async () => {
    const host = new FakeHost();
    host.files.set("a.txt", "x x x");
    const result = await EDIT_TOOL.execute(
      { path: "a.txt", old_string: "x", new_string: "y" },
      { host },
    );
    expect(result.isError).toBe(true);
    expect(host.files.get("a.txt")).toBe("x x x");
  });

  it("edit_file replaces all when asked", async () => {
    const host = new FakeHost();
    host.files.set("a.txt", "x x x");
    const result = await EDIT_TOOL.execute(
      { path: "a.txt", old_string: "x", new_string: "y", replace_all: true },
      { host },
    );
    expect(result.isError).toBeUndefined();
    expect(host.files.get("a.txt")).toBe("y y y");
  });

  it("glob lists matching files and is read-only", async () => {
    const host = new FakeHost();
    host.files.set("src/a.ts", "");
    host.files.set("src/b.ts", "");
    host.files.set("readme.md", "");
    expect(GLOB_TOOL.risk).toBe("safe");
    const result = await GLOB_TOOL.execute({ pattern: "src/**/*.ts" }, { host });
    expect(result.content).toContain("src/a.ts");
    expect(result.content).toContain("src/b.ts");
    expect(result.content).not.toContain("readme.md");
  });

  it("list_dir shows files and subdirectories", async () => {
    const host = new FakeHost();
    host.files.set("a.txt", "");
    host.files.set("src/b.ts", "");
    const result = await LIST_TOOL.execute({}, { host });
    expect(result.content).toContain("a.txt");
    expect(result.content).toContain("src/");
  });

  it("grep returns matching lines as path:line: text", async () => {
    const host = new FakeHost();
    host.files.set("a.ts", "const x = 1;\nconst y = 2;");
    host.files.set("b.ts", "let z = 3;");
    expect(GREP_TOOL.risk).toBe("safe");
    const result = await GREP_TOOL.execute({ pattern: "const" }, { host });
    expect(result.content).toContain("a.ts:1: const x = 1;");
    expect(result.content).toContain("a.ts:2: const y = 2;");
    expect(result.content).not.toContain("b.ts");
  });

  it("todo_write renders a status checklist", async () => {
    const host = new FakeHost();
    const result = await TODO_WRITE_TOOL.execute(
      {
        todos: [
          { content: "scan", status: "completed" },
          { content: "fix", status: "in_progress" },
          { content: "test", status: "pending" },
        ],
      },
      { host },
    );
    expect(result.content).toBe("[x] scan\n[~] fix\n[ ] test");
  });

  it("bash reports a non-zero exit as an error", async () => {
    const host = new FakeHost();
    host.execResult = { stdout: "", stderr: "boom", exitCode: 1 };
    const result = await BASH_TOOL.execute({ command: "false" }, { host });
    expect(result.isError).toBe(true);
    expect(result.content).toContain("boom");
    expect(result.content).toContain("exit code: 1");
    expect(host.execCalls).toEqual(["false"]);
  });
});

describe("runAgentLoop", () => {
  it("runs a tool call then returns the final answer", async () => {
    const host = new FakeHost();
    const provider = scriptedProvider([
      toolCallCompletion([
        { id: "t1", name: "write_file", args: { path: "x.txt", content: "hi" } },
      ]),
      textCompletion("Done."),
    ]);

    const result = await runAgentLoop({
      provider,
      messages: baseMessages,
      tools: [...DEFAULT_AGENT_TOOLS],
      host,
      requestApproval: approveAll,
    });

    expect(result.stoppedReason).toBe("completed");
    expect(result.text).toBe("Done.");
    expect(host.files.get("x.txt")).toBe("hi");
    // user + assistant(tool_call) + tool result + assistant(final)
    expect(result.messages).toHaveLength(4);
  });

  it("asks for approval on a mutating tool and skips it when denied", async () => {
    const host = new FakeHost();
    const requestApproval = vi.fn().mockResolvedValue("deny" as const);
    const provider = scriptedProvider([
      toolCallCompletion([
        { id: "t1", name: "write_file", args: { path: "x.txt", content: "hi" } },
      ]),
      textCompletion("Understood, skipping."),
    ]);

    const result = await runAgentLoop({
      provider,
      messages: baseMessages,
      tools: [...DEFAULT_AGENT_TOOLS],
      host,
      requestApproval,
    });

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(host.files.has("x.txt")).toBe(false);
    expect(result.text).toBe("Understood, skipping.");
  });

  it("does not re-prompt after approve_always for the same tool", async () => {
    const host = new FakeHost();
    const requestApproval = vi.fn().mockResolvedValue("approve_always" as const);
    const provider = scriptedProvider([
      toolCallCompletion([{ id: "t1", name: "write_file", args: { path: "a.txt", content: "1" } }]),
      toolCallCompletion([{ id: "t2", name: "write_file", args: { path: "b.txt", content: "2" } }]),
      textCompletion("All written."),
    ]);

    await runAgentLoop({
      provider,
      messages: baseMessages,
      tools: [...DEFAULT_AGENT_TOOLS],
      host,
      requestApproval,
    });

    expect(requestApproval).toHaveBeenCalledTimes(1);
    expect(host.files.get("a.txt")).toBe("1");
    expect(host.files.get("b.txt")).toBe("2");
  });

  it("stops at the iteration limit when the model never stops calling tools", async () => {
    const host = new FakeHost();
    const events: AgentEvent[] = [];
    const provider: LlmProvider = {
      chat: () =>
        Promise.resolve(
          toolCallCompletion([{ id: "t", name: "bash", args: { command: "echo hi" } }]),
        ),
      streamChat() {
        throw new Error("not used");
      },
      completeFim() {
        throw new Error("not used");
      },
    };

    const result = await runAgentLoop({
      provider,
      messages: baseMessages,
      tools: [...DEFAULT_AGENT_TOOLS],
      host,
      requestApproval: approveAll,
      maxIterations: 3,
      onEvent: (event) => events.push(event),
    });

    expect(result.stoppedReason).toBe("iteration_limit");
    expect(events.at(-1)).toEqual({ type: "iteration_limit", limit: 3 });
  });

  it("feeds an error back to the model for an unknown tool", async () => {
    const host = new FakeHost();
    const provider = scriptedProvider([
      toolCallCompletion([{ id: "t1", name: "nope", args: {} }]),
      textCompletion("Recovered."),
    ]);

    const result = await runAgentLoop({
      provider,
      messages: baseMessages,
      tools: [...DEFAULT_AGENT_TOOLS],
      host,
      requestApproval: approveAll,
    });

    const toolMessage = result.messages.find((message) => message.role === "tool");
    expect(toolMessage?.content).toContain("Unknown tool: nope");
    expect(result.text).toBe("Recovered.");
  });
});
