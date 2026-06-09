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

import type { AgentTool } from "./tools.js";

/**
 * Project-level agent policy, read from `.codesetu/agent.json`. Committable so a
 * team or enterprise can share one approval policy. Patterns are JavaScript
 * regular expressions tested against the trimmed shell command.
 */
export interface AgentPolicy {
  /** Override the loop's max provider round-trips. */
  maxIterations?: number;
  /** Commands matching any of these run without an approval prompt. */
  autoApproveCommands: string[];
  /** Commands matching any of these are blocked outright (deny wins). */
  denyCommands: string[];
}

/** What the policy says to do with a mutating tool call. */
export type PolicyDecision = "allow" | "deny" | "prompt";

export const EMPTY_AGENT_POLICY: AgentPolicy = {
  autoApproveCommands: [],
  denyCommands: [],
};

/** Parse a `.codesetu/agent.json` document, tolerating malformed input. */
export function parseAgentPolicy(text: string): AgentPolicy {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...EMPTY_AGENT_POLICY };
  }
  if (typeof data !== "object" || data === null) {
    return { ...EMPTY_AGENT_POLICY };
  }

  const record = data as Record<string, unknown>;
  const policy: AgentPolicy = {
    autoApproveCommands: stringArray(record.autoApproveCommands),
    denyCommands: stringArray(record.denyCommands),
  };
  if (typeof record.maxIterations === "number" && record.maxIterations > 0) {
    policy.maxIterations = Math.floor(record.maxIterations);
  }
  return policy;
}

/**
 * Build the loop's `resolvePolicy` from a parsed policy. Only the `bash` tool is
 * policy-controlled (commands are where allow/deny matters); other mutating
 * tools always prompt. Deny is checked before allow, so it wins.
 */
export function createBashCommandPolicy(
  policy: AgentPolicy,
): (tool: AgentTool, args: Record<string, unknown>) => PolicyDecision {
  const deny = compilePatterns(policy.denyCommands);
  const allow = compilePatterns(policy.autoApproveCommands);

  return (tool, args) => {
    if (tool.name !== "bash") {
      return "prompt";
    }
    const command = typeof args.command === "string" ? args.command.trim() : "";
    if (command.length === 0) {
      return "prompt";
    }
    if (deny.some((pattern) => pattern.test(command))) {
      return "deny";
    }
    if (allow.some((pattern) => pattern.test(command))) {
      return "allow";
    }
    return "prompt";
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function compilePatterns(patterns: string[]): RegExp[] {
  const compiled: RegExp[] = [];
  for (const pattern of patterns) {
    try {
      compiled.push(new RegExp(pattern));
    } catch {
      // Skip invalid patterns rather than failing the whole policy.
    }
  }
  return compiled;
}
