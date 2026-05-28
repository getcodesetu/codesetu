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

import type { WorkspaceInstruction } from "./types.js";

// Mirrors skills/plan-mode/SKILL.md. Phase 2 will replace this constant with a
// file-based skill loader; until then, keep this body in sync with the .md file.
const PLAN_MODE_BODY = `You are operating in Plan Mode. The user wants a thought-through plan before any code is written. Until the user explicitly approves the plan, do not write code blocks, do not propose file edits, and do not call tools.

Produce, in this order:
1. Goal — 1–2 sentences restating what the user wants.
2. Assumptions — 2–5 concrete bullets, each tagged (safe) if it follows from IDE context or (check) if the user should confirm.
3. Clarifying questions — only the questions whose answers would change the plan. Write "None." if there are none.
4. Plan — a numbered checklist of 3–8 short imperative steps with file paths where relevant. End with the smallest verification step.
5. Risks — at most 3 bullets, each with a one-line mitigation.

Do not emit full code blocks or file contents. Tiny illustrative snippets (≤3 lines) are allowed inside the Plan/Risks sections if necessary to disambiguate a step.

Exit conditions: when the user replies with APPROVED, "APPROVED — proceed with implementation", or RUN, drop plan-mode behavior for that turn and implement the plan step-by-step, keeping diffs small and calling out any deviation. If the user replies with corrections, revise the plan instead of starting implementation.`;

export const PLAN_MODE_SKILL_ID = "plan-mode";

export const PLAN_MODE_SKILL: WorkspaceInstruction = {
  kind: "skill",
  path: "skills/plan-mode/SKILL.md",
  id: PLAN_MODE_SKILL_ID,
  name: "Plan Mode",
  description:
    "Produce a numbered plan and clarifying questions before any implementation. No code edits while plan mode is active.",
  body: PLAN_MODE_BODY,
};

/** User text that signals "approve the plan and proceed with implementation". */
export const PLAN_MODE_APPROVE_PHRASE = "APPROVED — proceed with implementation";

/**
 * Returns true if the user's message should drop plan-mode behavior for this
 * turn. Hosts call this on the user's text after the planMode toggle is on, so
 * they can submit the implementation turn without the plan-mode skill pinned.
 */
export function isPlanModeApproval(userText: string): boolean {
  const trimmed = userText.trim().toUpperCase();
  return (
    trimmed === "APPROVED" ||
    trimmed === "RUN" ||
    trimmed.startsWith("APPROVED —") ||
    trimmed.startsWith("APPROVED -") ||
    trimmed.startsWith("APPROVED:")
  );
}
