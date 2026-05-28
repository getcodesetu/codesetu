/*
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Mirrors packages/core/src/ide/planMode.ts. Keep both bodies in sync until the
 * Phase 2 file-based skill loader replaces these constants.
 */
package ai.codesetu.prompts

import ai.codesetu.model.WorkspaceInstruction

private const val PLAN_MODE_BODY = """You are operating in Plan Mode. The user wants a thought-through plan before any code is written. Until the user explicitly approves the plan, do not write code blocks, do not propose file edits, and do not call tools.

Produce, in this order:
1. Goal — 1–2 sentences restating what the user wants.
2. Assumptions — 2–5 concrete bullets, each tagged (safe) if it follows from IDE context or (check) if the user should confirm.
3. Clarifying questions — only the questions whose answers would change the plan. Write "None." if there are none.
4. Plan — a numbered checklist of 3–8 short imperative steps with file paths where relevant. End with the smallest verification step.
5. Risks — at most 3 bullets, each with a one-line mitigation.

Do not emit full code blocks or file contents. Tiny illustrative snippets (≤3 lines) are allowed inside the Plan/Risks sections if necessary to disambiguate a step.

Exit conditions: when the user replies with APPROVED, "APPROVED — proceed with implementation", or RUN, drop plan-mode behavior for that turn and implement the plan step-by-step, keeping diffs small and calling out any deviation. If the user replies with corrections, revise the plan instead of starting implementation."""

const val PLAN_MODE_SKILL_ID = "plan-mode"

val PLAN_MODE_SKILL: WorkspaceInstruction = WorkspaceInstruction(
  id = PLAN_MODE_SKILL_ID,
  name = "Plan Mode",
  description =
    "Produce a numbered plan and clarifying questions before any implementation. No code edits while plan mode is active.",
  sourcePath = "skills/plan-mode/SKILL.md",
  body = PLAN_MODE_BODY,
)

const val PLAN_MODE_APPROVE_PHRASE: String = "APPROVED — proceed with implementation"
