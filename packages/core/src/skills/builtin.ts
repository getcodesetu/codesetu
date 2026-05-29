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

import { PLAN_MODE_SKILL } from "../ide/planMode.js";
import type { WorkspaceInstruction } from "../ide/types.js";

/**
 * A built-in skill. The body mirrors the canonical skills/<id>/SKILL.md file at
 * the repo root. Keep them in sync; the .md is the human-readable source of
 * truth, the constant is what ships in the extension bundle. Phase 2's loader
 * uses constants instead of file IO so both hosts work the same way without a
 * build-time copy step.
 */
export type BuiltinSkill = WorkspaceInstruction & {
  /** Slash commands that route to this skill. First entry is the primary one. */
  readonly slashCommands: readonly string[];
  /** Keywords used by the auto-router. Case-insensitive substring match. */
  readonly keywords: readonly string[];
};

const EXPLAIN_CODE_BODY = `The user wants an explanation of code that's already in front of them. Produce a tight, structured explanation grounded in the supplied IDE context.

Structure:
1. One-line summary — what this code does in plain English.
2. Flow — 3–6 key steps in order, numbered, referencing actual function/variable names.
3. Inputs / outputs — what goes in, what comes out, side effects (I/O, state mutation, exceptions).
4. Why it might surprise you — at most 2 bullets on non-obvious behavior. Skip if there is nothing real to say.

Rules: anchor to the actual code supplied (do not invent signatures); use the language's terminology; if only a snippet is supplied and surrounding context is needed, say so in one line; skip the "this code is a function called X" preamble.`;

const REFACTOR_BODY = `Propose a focused refactor that preserves behavior. The user does not want a rewrite — they want a clearer version of the same logic.

Structure:
1. What changes — 2–4 bullets summarizing the moves (extract helper, replace nested ifs with early returns, rename tmp → pendingRequests). Do not list every renamed local.
2. Refactored code — one code block, language matching the selection, keep the public signature stable unless the user asked otherwise.
3. Why — one paragraph, 3–5 sentences tying each change to a concrete readability/maintainability gain.
4. Behavior preserved — short bullet list of what stays the same (signatures, exceptions, return shapes, side-effect order). If any of these change, stop and say so.

Rules: no new deps, no premature abstractions, no error handling for cases that can't happen; if there are obvious bugs, note them under "Bugs spotted (out of scope)" — do not silently fix them under the refactor banner; if the right answer is "don't refactor", say so in one sentence and stop.`;

const WRITE_TESTS_BODY = `Generate tests for the selected code. Match the project's existing test framework — infer from imports in the active file, the language, or the IDE context. Do not invent a new framework.

Structure:
1. Detected framework — one line (vitest, jest, pytest, JUnit 5, etc.). If you can't tell, ask in one sentence and stop.
2. Test code — one code block. State the suggested file path in a comment on the first line.
3. Cases covered — short numbered list, one line per case.

Rules: cover happy path first then 1–3 real edge cases (null/empty, boundaries, error paths, concurrency if relevant); don't pad with 12 trivial assertions; don't mock the system under test; use project helpers/fixtures if visible; structure around the smallest realistic seam for hard-to-test side effects and say which seam you used; no inline comments restating what an assertion does.`;

const INDIC_COMMENTS_BODY = `The user wants code comments written in or translated to an Indian language. Preserve technical accuracy while making the comments natural for an Indian developer who codes in English and reads docs in their native language.

Produce:
1. The code with comments added or translated, in one code block, language matching the source.
2. Glossary — short table (at most 6 rows) mapping English technical terms kept verbatim to the Indic gloss used in comments.

Conventions: keep technical English terms (API, request, response, mutex, goroutine, hash, JSON, regex, async/await) as English in Latin script; identifiers and file paths stay as-is and are never transliterated; comments are 1–2 lines per logical block, not per line; colloquial register, not formal/literary; if the user did not specify a language and the project hints at one, use that, else default to Hindi and ask "switch to <language>?" at the end; honor script preferences (Devanagari vs Tamil vs Bengali); add comments where they explain why, not what.`;

export const EXPLAIN_CODE_SKILL: BuiltinSkill = {
  kind: "skill",
  path: "skills/explain-code/SKILL.md",
  id: "explain-code",
  name: "Explain Code",
  description:
    "Produce a structured explanation of selected code or the active file. Use when the user asks 'what does this do' or 'explain this'.",
  body: EXPLAIN_CODE_BODY,
  slashCommands: ["/explain"],
  keywords: ["explain", "what does", "what is this", "how does this", "walk me through"],
};

export const REFACTOR_SKILL: BuiltinSkill = {
  kind: "skill",
  path: "skills/refactor/SKILL.md",
  id: "refactor",
  name: "Refactor",
  description:
    "Propose a focused refactor of the selected code with rationale, preserving behavior. Use when the user says 'refactor', 'clean up', 'simplify'.",
  body: REFACTOR_BODY,
  slashCommands: ["/refactor"],
  keywords: ["refactor", "clean up", "cleanup", "simplify", "improve readability", "tidy"],
};

export const WRITE_TESTS_SKILL: BuiltinSkill = {
  kind: "skill",
  path: "skills/write-tests/SKILL.md",
  id: "write-tests",
  name: "Write Tests",
  description:
    "Generate focused tests for the selected code in the project's existing test framework. Use when the user asks for tests or coverage.",
  body: WRITE_TESTS_BODY,
  slashCommands: ["/test", "/tests"],
  keywords: ["write tests", "add tests", "test this", "unit test", "test coverage", "cover with tests"],
};

export const INDIC_COMMENTS_SKILL: BuiltinSkill = {
  kind: "skill",
  path: "skills/indic-comments/SKILL.md",
  id: "indic-comments",
  name: "Indic Code Comments",
  description:
    "Generate or translate code comments in Indian languages (Hindi, Tamil, Bengali, ...). Use when the user asks for comments in an Indic language.",
  body: INDIC_COMMENTS_BODY,
  slashCommands: ["/indic"],
  keywords: [
    "hindi",
    "हिंदी",
    "tamil",
    "தமிழ்",
    "bengali",
    "বাংলা",
    "marathi",
    "telugu",
    "kannada",
    "malayalam",
    "gujarati",
    "punjabi",
    "odia",
    "indic",
    "comments in",
    "translate comments",
  ],
};

const PLAN_MODE_BUILTIN: BuiltinSkill = {
  ...PLAN_MODE_SKILL,
  slashCommands: ["/plan"],
  keywords: ["plan this", "make a plan", "propose a plan", "step by step plan"],
};

export const BUILTIN_SKILLS: readonly BuiltinSkill[] = [
  PLAN_MODE_BUILTIN,
  EXPLAIN_CODE_SKILL,
  REFACTOR_SKILL,
  WRITE_TESTS_SKILL,
  INDIC_COMMENTS_SKILL,
];

export function findBuiltinSkill(id: string): BuiltinSkill | undefined {
  return BUILTIN_SKILLS.find((skill) => skill.id === id);
}
