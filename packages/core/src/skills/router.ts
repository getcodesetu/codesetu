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

import type { WorkspaceInstruction } from "../ide/types.js";
import type { BuiltinSkill } from "./builtin.js";

export interface RouteSkillsInput {
  /** User's raw chat message for this turn. */
  userText: string;
  /** Skill candidates the router may choose from. */
  skills: readonly BuiltinSkill[];
  /** Skill ids forcibly included regardless of routing (e.g. Plan Mode toggle). */
  pinnedIds?: readonly string[];
  /** If false, only slash-invoked and pinned skills are selected (no keyword auto-route). */
  autoRoute?: boolean;
}

export interface RouteSkillsResult {
  /** Skills to inject into the system message, in order: pinned, then slash, then auto-routed. */
  selected: WorkspaceInstruction[];
  /** Slash command consumed from userText, if any — host strips it from the message sent to the model. */
  consumedSlash?: string;
  /**
   * The user text with any leading slash command removed. Equal to the input
   * when no slash matched. Hosts use this as the message that goes to the LLM.
   */
  cleanedUserText: string;
}

const MAX_AUTO_ROUTED = 1;

/**
 * Deterministic v1 router: pinned + slash + keyword, capped. A later
 * LlmRouter can swap in behind the same interface without changing callers.
 */
export function routeSkills(input: RouteSkillsInput): RouteSkillsResult {
  const { userText, skills } = input;
  const pinnedIds = new Set(input.pinnedIds ?? []);
  const autoRoute = input.autoRoute ?? true;

  const selected: WorkspaceInstruction[] = [];
  const seen = new Set<string>();
  const pushOnce = (skill: BuiltinSkill): void => {
    if (seen.has(skill.id)) return;
    seen.add(skill.id);
    selected.push(skill);
  };

  for (const id of pinnedIds) {
    const skill = skills.find((candidate) => candidate.id === id);
    if (skill !== undefined) pushOnce(skill);
  }

  const slashMatch = matchSlashCommand(userText, skills);
  let cleanedUserText = userText;
  let consumedSlash: string | undefined;
  if (slashMatch !== undefined) {
    pushOnce(slashMatch.skill);
    cleanedUserText = slashMatch.remainder;
    consumedSlash = slashMatch.command;
  }

  if (autoRoute) {
    const autoRouted = scoreByKeywords(cleanedUserText, skills)
      .filter((entry) => !seen.has(entry.skill.id))
      .slice(0, MAX_AUTO_ROUTED);
    for (const entry of autoRouted) {
      pushOnce(entry.skill);
    }
  }

  return consumedSlash === undefined
    ? { selected, cleanedUserText }
    : { selected, cleanedUserText, consumedSlash };
}

function matchSlashCommand(
  userText: string,
  skills: readonly BuiltinSkill[],
): { skill: BuiltinSkill; command: string; remainder: string } | undefined {
  // Slash must be at the very start, followed by space or end-of-string. Lets
  // users still write "/" or paths inside the message body without triggering.
  const trimmed = userText.trimStart();
  if (!trimmed.startsWith("/")) return undefined;

  const spaceIndex = trimmed.search(/\s/);
  const candidate = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const remainder = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1);

  for (const skill of skills) {
    if (skill.slashCommands.includes(candidate)) {
      return { skill, command: candidate, remainder };
    }
  }

  return undefined;
}

function scoreByKeywords(
  userText: string,
  skills: readonly BuiltinSkill[],
): { skill: BuiltinSkill; score: number }[] {
  const haystack = userText.toLowerCase();
  if (haystack.trim().length === 0) return [];

  const scored: { skill: BuiltinSkill; score: number }[] = [];
  for (const skill of skills) {
    let score = 0;
    for (const keyword of skill.keywords) {
      if (haystack.includes(keyword.toLowerCase())) {
        // Longer keywords are more specific, so they outweigh short ones.
        score += keyword.length;
      }
    }
    // Threshold: at least one keyword of length >= 4 matched. Cheap guard
    // against short common words (e.g. "test") triggering the wrong skill.
    if (score >= 4) {
      scored.push({ skill, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
