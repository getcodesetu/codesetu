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

import {
  DEFAULT_AGENT_TOOLS,
  createBashCommandPolicy,
  parseAgentPolicy,
  runAgentLoop,
  type AgentEvent,
  type AgentPolicy,
  type AgentTool,
  type ApprovalDecision,
  type ApprovalRequest,
  type ChatMessage,
  type ChatStreamChunk,
  type LlmProvider,
} from "@codesetu/core";
import * as vscode from "vscode";

import { createCheckpointingHost, type WorkspaceCheckpoint } from "./agentCheckpoint";
import { createNodeAgentHost } from "./agentHost";
import { createVscodeNativeTools } from "./agentNativeTools";

/**
 * A short addendum to the system prompt that flips the assistant from "describe
 * the change" to "make the change", introducing the four primitive tools. Kept
 * deliberately tiny — minimal prompts travel better across the smaller/local
 * models CodeSetu targets.
 */
export const AGENT_MODE_SYSTEM_NOTE =
  "Agent mode is on. You can read and modify the workspace and run shell commands using the " +
  "provided tools (read_file, write_file, edit_file, bash, and the read-only search tools). " +
  "When the user asks you to create, change, scaffold, or run something, DO IT by calling the " +
  "tools. Do NOT give setup tutorials, do NOT tell the user to use an external website, IDE, or " +
  "generator (e.g. Spring Initializr), do NOT print files or commands for the user to copy, and " +
  "never claim you did something you did not actually do via a tool. To create a project or " +
  "folder, call write_file once per file (it creates any missing parent directories). Create the " +
  "files a project needs BEFORE building or running it — do not run build/run commands (mvn, " +
  "npm, gradle, etc.) until those files exist. Take one action at a time and use the real tool " +
  "results to decide the next step. File edits and shell commands require the user's approval " +
  "before they run.";

export interface RunAgentTurnOptions {
  provider: LlmProvider;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  workspaceRoot: string | undefined;
  /** Extra tools appended to the defaults (e.g. @workspace semantic search). */
  extraTools?: AgentTool[];
  onChunk?: (chunk: ChatStreamChunk) => void;
  /** Receives the turn's new messages (tool turns + final answer) to persist. */
  onPersist?: (messages: ChatMessage[]) => void;
  /** Inline approval handler; falls back to a native modal when omitted. */
  requestApproval?: (request: ApprovalRequest) => Promise<ApprovalDecision>;
  /** Receives the turn's file checkpoint when it edited at least one file. */
  onCheckpoint?: (checkpoint: WorkspaceCheckpoint) => void;
  outputChannel: vscode.OutputChannel;
  signal?: AbortSignal;
}

/**
 * Run one agent turn: drive the tool-calling loop and surface the model's
 * narration, tool activity, and final answer to the chat as streamed content.
 */
export async function runAgentTurn(options: RunAgentTurnOptions): Promise<string> {
  const { host, checkpoint } = createCheckpointingHost(
    createNodeAgentHost(options.workspaceRoot),
    options.workspaceRoot,
  );
  const policy = await loadAgentPolicy(options.workspaceRoot);
  const tools = [
    ...DEFAULT_AGENT_TOOLS,
    ...createVscodeNativeTools(options.workspaceRoot),
    ...(options.extraTools ?? []),
  ];
  let toolCallCount = 0;

  options.outputChannel.appendLine(
    `[agent] tool loop started — ${tools.length} tools, root=${options.workspaceRoot ?? "(none)"}`,
  );

  const result = await runAgentLoop({
    provider: options.provider,
    messages: options.messages,
    tools,
    host,
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(policy.maxIterations === undefined ? {} : { maxIterations: policy.maxIterations }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    requestApproval: options.requestApproval ?? ((request) => requestToolApproval(request)),
    resolvePolicy: createBashCommandPolicy(policy),
    onEvent: (event) => {
      if (event.type === "tool_call") {
        toolCallCount += 1;
      }
      emitEvent(event, options.onChunk, options.outputChannel);
    },
  });

  options.outputChannel.appendLine(
    `[agent] finished — stoppedReason=${result.stoppedReason}, toolCalls=${toolCallCount}`,
  );
  if (toolCallCount === 0) {
    options.outputChannel.appendLine(
      "[agent] the model returned an answer without calling any tool. " +
        "It needs a model that reliably uses function/tool calling.",
    );
  }
  if (result.stoppedReason === "iteration_limit") {
    options.outputChannel.appendLine("Agent loop hit the iteration limit.");
  }
  if (result.stoppedReason === "aborted") {
    options.onChunk?.({ content: "\n\n_Stopped by you._\n" });
  }
  // Offer one-click undo for the turn's file edits (write_file / edit_file).
  if (!checkpoint.isEmpty()) {
    const count = checkpoint.changedFiles().length;
    options.onCheckpoint?.(checkpoint);
    options.onChunk?.({
      content: `\n\n_Edited ${count} file${count === 1 ? "" : "s"}. Run **CodeSetu: Revert Last Agent Edits** to undo this turn._\n`,
    });
  }
  // Everything the loop appended beyond the seed (assistant tool-call turns,
  // tool results, final answer) is the new history to persist for next turn.
  options.onPersist?.(result.messages.slice(options.messages.length));
  return result.text;
}

/** Load the committable project agent policy from `.codesetu/agent.json`. */
async function loadAgentPolicy(root: string | undefined): Promise<AgentPolicy> {
  if (root === undefined) {
    return parseAgentPolicy("{}");
  }
  try {
    const text = await fs.readFile(path.join(root, ".codesetu", "agent.json"), "utf8");
    return parseAgentPolicy(text);
  } catch {
    return parseAgentPolicy("{}"); // no file / unreadable → permissive defaults
  }
}

/** Modal approval gate for a mutating tool call. */
async function requestToolApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
  const choice = await vscode.window.showWarningMessage(
    `CodeSetu wants to run "${request.tool.name}"`,
    { modal: true, detail: request.preview ?? describeApproval(request) },
    "Approve",
    "Approve for session",
  );
  if (choice === "Approve") {
    return "approve";
  }
  if (choice === "Approve for session") {
    return "approve_always";
  }
  return "deny";
}

function describeApproval(request: ApprovalRequest): string {
  const args = request.args;
  switch (request.tool.name) {
    case "bash":
      return `Command:\n${asString(args.command) ?? request.rawArguments}`;
    case "write_file":
      return `Write file: ${asString(args.path) ?? "?"}`;
    case "edit_file":
      return `Edit file: ${asString(args.path) ?? "?"}`;
    default:
      return request.rawArguments;
  }
}

function emitEvent(
  event: AgentEvent,
  onChunk: ((chunk: ChatStreamChunk) => void) | undefined,
  outputChannel: vscode.OutputChannel,
): void {
  switch (event.type) {
    case "assistant_text":
      onChunk?.({ content: `${event.text}\n` });
      break;
    case "tool_call":
      onChunk?.({ content: `\n\n\`🔧 ${event.name}\` ${summarizeArgs(event.name, event.args)}\n` });
      break;
    case "tool_result": {
      const label = event.denied === true ? "🚫 denied" : event.isError ? "⚠️ error" : "✓ done";
      outputChannel.appendLine(`[agent] ${event.name}: ${label}`);
      if (event.isError) {
        onChunk?.({ content: `\n> ${label}: ${firstLine(event.content)}\n` });
      }
      break;
    }
    case "iteration_limit":
      onChunk?.({
        content: `\n\n_Stopped after ${event.limit} steps. Ask me to continue if needed._\n`,
      });
      break;
    default:
      break;
  }
}

function summarizeArgs(toolName: string, args: Record<string, unknown>): string {
  if (toolName === "bash") {
    return `\`${truncateInline(asString(args.command) ?? "")}\``;
  }
  const filePath = asString(args.path);
  return filePath === undefined ? "" : `\`${filePath}\``;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function truncateInline(text: string, limit = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine;
}

function firstLine(text: string): string {
  return truncateInline(text.split("\n")[0] ?? "", 200);
}
