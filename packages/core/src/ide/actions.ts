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

import { buildContextMarkdown } from "./context.js";
import type { IdeActionId, IdeContextPayload, WorkspaceInstruction } from "./types.js";

export const IDE_ACTIONS: Record<IdeActionId, { label: string; prompt: string }> = {
  explain: {
    label: "Explain",
    prompt: "Explain the selected code and its role in the surrounding file.",
  },
  refactor: {
    label: "Refactor",
    prompt: "Refactor the selected code while preserving behavior.",
  },
  "write-tests": {
    label: "Write tests",
    prompt: "Write focused tests for the selected code and nearby behavior.",
  },
  "fix-bug": {
    label: "Fix bug",
    prompt: "Find and fix the likely bug in the selected code.",
  },
  "add-docs": {
    label: "Add docs",
    prompt: "Add concise documentation for the selected code.",
  },
};

export function buildActionUserMessage(
  actionId: IdeActionId,
  context: IdeContextPayload,
  instructions: WorkspaceInstruction[] = [],
): string {
  const action = IDE_ACTIONS[actionId];
  const parts = [action.prompt, buildContextMarkdown(context)];

  if (instructions.length > 0) {
    parts.push(formatWorkspaceInstructions(instructions));
  }

  return parts.join("\n\n");
}

export interface SystemMessageOptions {
  /**
   * Skill-like prompt fragments pinned for this turn. Appended after the
   * workspace instructions so they have the last word in the system prompt.
   * Used by Plan Mode and (in Phase 2) the routed-skill flow.
   */
  pinnedSkills?: WorkspaceInstruction[];
}

export function buildCodeSetuSystemMessage(
  instructions: WorkspaceInstruction[] = [],
  options: SystemMessageOptions = {},
): string {
  const parts = [
    "You are CodeSetu, an IDE coding assistant for Indian developers. Be precise, code-aware, and concise.",
    "Use the supplied IDE context as the source of truth. Ask for missing context when needed.",
  ];

  if (instructions.length > 0) {
    parts.push(formatWorkspaceInstructions(instructions));
  }

  const pinned = options.pinnedSkills ?? [];
  if (pinned.length > 0) {
    parts.push(formatPinnedSkills(pinned));
  }

  return parts.join("\n\n");
}

function formatWorkspaceInstructions(instructions: WorkspaceInstruction[]): string {
  const rendered = instructions.map((instruction) =>
    [
      `${instruction.kind}: ${instruction.name} (${instruction.id})`,
      instruction.description,
      instruction.body,
    ].join("\n"),
  );

  return ["Workspace instructions", ...rendered].join("\n\n");
}

function formatPinnedSkills(skills: WorkspaceInstruction[]): string {
  const rendered = skills.map((skill) =>
    [`Skill: ${skill.name} (${skill.id})`, skill.description, skill.body].join("\n"),
  );

  return ["Active skills", ...rendered].join("\n\n");
}
