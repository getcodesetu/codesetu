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

import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

import type { ChatMessage, LlmProvider } from "../providers/base.js";
import type { AgentHost } from "./host.js";
import type { AgentTool } from "./tools.js";

/** What the user decides when a mutating tool asks for approval. */
export type ApprovalDecision = "approve" | "approve_always" | "deny";

export interface ApprovalRequest {
  tool: AgentTool;
  args: Record<string, unknown>;
  /** Raw arguments string from the model — useful when it isn't valid JSON. */
  rawArguments: string;
  /** Human-readable preview of the pending change (e.g. a diff), if available. */
  preview?: string;
}

/** Streamed observability into a loop run, for surfacing activity in the UI. */
export type AgentEvent =
  | { type: "assistant_text"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | {
      type: "tool_result";
      id: string;
      name: string;
      content: string;
      isError: boolean;
      denied?: boolean;
    }
  | { type: "iteration_limit"; limit: number };

export type StoppedReason = "completed" | "iteration_limit" | "aborted";

export interface AgentLoopOptions {
  provider: LlmProvider;
  /** Conversation so far (system + user + prior turns). Not mutated. */
  messages: ChatMessage[];
  tools: AgentTool[];
  host: AgentHost;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Hard cap on provider round-trips before giving up. */
  maxIterations?: number;
  /** Called for every mutating tool call that isn't already session-approved. */
  requestApproval: (request: ApprovalRequest) => Promise<ApprovalDecision>;
  /**
   * Project-policy gate consulted before prompting: "allow" runs without asking,
   * "deny" blocks the call outright, "prompt" (default) asks the user.
   */
  resolvePolicy?: (tool: AgentTool, args: Record<string, unknown>) => "allow" | "deny" | "prompt";
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  /** Full transcript including assistant tool-call turns and tool results. */
  messages: ChatMessage[];
  /** The latest assistant text — the answer to show the user. */
  text: string;
  stoppedReason: StoppedReason;
}

export const DEFAULT_MAX_ITERATIONS = 16;

/**
 * Drive a provider through a tool-calling loop: ask the model, run any tool
 * calls it requests (gating mutating ones behind `requestApproval`), feed the
 * results back, and repeat until the model answers without calling a tool or a
 * guardrail trips. This is the piece that turns a chat assistant into an agent.
 */
export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { provider, tools, host, requestApproval, resolvePolicy, onEvent, signal } = options;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const messages: ChatMessage[] = [...options.messages];
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const toolSchemas = tools.map(toChatCompletionTool);
  const alwaysApproved = new Set<string>();
  let finalText = "";

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (signal?.aborted) {
      return { messages, text: finalText, stoppedReason: "aborted" };
    }

    const completion = await provider.chat({
      messages,
      tools: toolSchemas,
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    });

    const message = completion.choices[0]?.message;
    if (message === undefined) {
      return { messages, text: finalText, stoppedReason: "completed" };
    }

    const assistantText = typeof message.content === "string" ? message.content : "";
    const toolCalls = extractToolCalls(message.tool_calls);

    messages.push({
      role: "assistant",
      content: assistantText,
      ...(message.tool_calls && message.tool_calls.length > 0
        ? { tool_calls: message.tool_calls }
        : {}),
    });

    if (assistantText.length > 0) {
      finalText = assistantText;
      onEvent?.({ type: "assistant_text", text: assistantText });
    }

    if (toolCalls.length === 0) {
      return { messages, text: finalText, stoppedReason: "completed" };
    }

    for (const call of toolCalls) {
      if (signal?.aborted) {
        return { messages, text: finalText, stoppedReason: "aborted" };
      }

      const tool = toolsByName.get(call.name);
      if (tool === undefined) {
        emitResult(messages, onEvent, call.id, call.name, `Unknown tool: ${call.name}`, true);
        continue;
      }

      const parsed = parseArguments(call.arguments);
      onEvent?.({ type: "tool_call", id: call.id, name: tool.name, args: parsed });

      if (tool.risk === "mutating" && !alwaysApproved.has(tool.name)) {
        const policy = resolvePolicy?.(tool, parsed) ?? "prompt";
        if (policy === "deny") {
          emitResult(
            messages,
            onEvent,
            call.id,
            tool.name,
            "Blocked by workspace policy (.codesetu/agent.json denyCommands).",
            true,
            true,
          );
          continue;
        }
        if (policy === "prompt") {
          let preview: string | undefined;
          if (tool.preview !== undefined) {
            try {
              preview = await tool.preview(parsed, { host, ...(signal ? { signal } : {}) });
            } catch {
              preview = undefined; // a preview failure must never block the action
            }
          }
          const decision = await requestApproval({
            tool,
            args: parsed,
            rawArguments: call.arguments,
            ...(preview === undefined ? {} : { preview }),
          });
          if (decision === "deny") {
            emitResult(
              messages,
              onEvent,
              call.id,
              tool.name,
              "User denied this action.",
              true,
              true,
            );
            continue;
          }
          if (decision === "approve_always") {
            alwaysApproved.add(tool.name);
          }
        }
        // policy === "allow" falls through to execute without prompting.
      }

      let content: string;
      let isError: boolean;
      try {
        const result = await tool.execute(parsed, { host, ...(signal ? { signal } : {}) });
        content = result.content;
        isError = result.isError === true;
      } catch (error) {
        content = `Tool error: ${error instanceof Error ? error.message : String(error)}`;
        isError = true;
      }
      emitResult(messages, onEvent, call.id, tool.name, content, isError);
    }
  }

  onEvent?.({ type: "iteration_limit", limit: maxIterations });
  return { messages, text: finalText, stoppedReason: "iteration_limit" };
}

interface ParsedToolCall {
  id: string;
  name: string;
  arguments: string;
}

function extractToolCalls(
  toolCalls: ChatCompletionMessageToolCall[] | undefined,
): ParsedToolCall[] {
  if (toolCalls === undefined) {
    return [];
  }
  const parsed: ParsedToolCall[] = [];
  for (const call of toolCalls) {
    if (call.type === "function") {
      parsed.push({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      });
    }
  }
  return parsed;
}

function parseArguments(raw: string): Record<string, unknown> {
  if (raw.trim().length === 0) {
    return {};
  }
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function emitResult(
  messages: ChatMessage[],
  onEvent: ((event: AgentEvent) => void) | undefined,
  id: string,
  name: string,
  content: string,
  isError: boolean,
  denied = false,
): void {
  messages.push({ role: "tool", tool_call_id: id, content });
  onEvent?.({ type: "tool_result", id, name, content, isError, ...(denied ? { denied } : {}) });
}

/**
 * Make a transcript safe to send to the provider after history trimming may
 * have split tool-call/result pairs. OpenAI-compatible APIs reject an assistant
 * `tool_calls` turn whose results are missing, and a `tool` message with no
 * preceding assistant call. This drops both: dangling `tool_calls` (no matching
 * result) and orphan tool messages (no surviving call). Use it when building a
 * provider request from persisted history that may include past agent turns.
 */
export function sanitizeToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const respondedIds = new Set<string>();
  for (const message of messages) {
    if (message.role === "tool" && typeof message.tool_call_id === "string") {
      respondedIds.add(message.tool_call_id);
    }
  }

  const keptCallIds = new Set<string>();
  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (
      message.role === "assistant" &&
      Array.isArray(message.tool_calls) &&
      message.tool_calls.length > 0
    ) {
      const kept = message.tool_calls.filter((call) => respondedIds.has(call.id));
      if (kept.length === message.tool_calls.length) {
        result.push(message);
        kept.forEach((call) => keptCallIds.add(call.id));
      } else if (kept.length > 0) {
        result.push({ ...message, tool_calls: kept });
        kept.forEach((call) => keptCallIds.add(call.id));
      } else {
        const content = typeof message.content === "string" ? message.content : "";
        if (content.length > 0) {
          result.push({ role: "assistant", content });
        }
      }
    } else if (message.role === "tool") {
      if (typeof message.tool_call_id === "string" && keptCallIds.has(message.tool_call_id)) {
        result.push(message);
      }
    } else {
      result.push(message);
    }
  }
  return result;
}

function toChatCompletionTool(tool: AgentTool): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
