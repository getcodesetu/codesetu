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
  type ApprovalDecision,
  type ApprovalRequest,
  type ChatMessage,
  type ChatStreamChunk,
  type LlmProvider,
} from "@codesetu/core";
import * as vscode from "vscode";

import { createNodeAgentHost } from "./agentHost";
import { createVscodeNativeTools } from "./agentNativeTools";

/**
 * A short addendum to the system prompt that flips the assistant from "describe
 * the change" to "make the change", introducing the four primitive tools. Kept
 * deliberately tiny — minimal prompts travel better across the smaller/local
 * models CodeSetu targets.
 */
export const AGENT_MODE_SYSTEM_NOTE =
  "Agent mode is on. You can read and modify the workspace and run shell commands " +
  "using the provided tools (read_file, write_file, edit_file, bash). Prefer making " +
  "the change directly and verifying it (e.g. run tests) over only describing it. " +
  "File edits and commands require the user's approval before they run.";

export interface RunAgentTurnOptions {
  provider: LlmProvider;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  workspaceRoot: string | undefined;
  onChunk?: (chunk: ChatStreamChunk) => void;
  /** Receives the turn's new messages (tool turns + final answer) to persist. */
  onPersist?: (messages: ChatMessage[]) => void;
  outputChannel: vscode.OutputChannel;
  signal?: AbortSignal;
}

/**
 * Run one agent turn: drive the tool-calling loop and surface the model's
 * narration, tool activity, and final answer to the chat as streamed content.
 */
export async function runAgentTurn(options: RunAgentTurnOptions): Promise<string> {
  const host = createNodeAgentHost(options.workspaceRoot);
  const policy = await loadAgentPolicy(options.workspaceRoot);

  const result = await runAgentLoop({
    provider: options.provider,
    messages: options.messages,
    tools: [...DEFAULT_AGENT_TOOLS, ...createVscodeNativeTools(options.workspaceRoot)],
    host,
    ...(options.model === undefined ? {} : { model: options.model }),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(policy.maxIterations === undefined ? {} : { maxIterations: policy.maxIterations }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    requestApproval: (request) => requestToolApproval(request),
    resolvePolicy: createBashCommandPolicy(policy),
    onEvent: (event) => emitEvent(event, options.onChunk, options.outputChannel),
  });

  if (result.stoppedReason === "iteration_limit") {
    options.outputChannel.appendLine("Agent loop hit the iteration limit.");
  }
  if (result.stoppedReason === "aborted") {
    options.onChunk?.({ content: "\n\n_Stopped by you._\n" });
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
