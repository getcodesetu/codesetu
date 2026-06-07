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

import { parseFrontmatter, splitFrontmatter } from "../ide/frontmatter.js";
import type { WorkspaceInstructionSource } from "../ide/types.js";
import type { BuiltinSkill } from "./builtin.js";

export interface ParseBuiltinSkillsResult {
  skills: BuiltinSkill[];
  warnings: string[];
}

/**
 * Parse built-in skills from SKILL.md content. The canonical source of truth is
 * `skills/<id>/SKILL.md` at the repo root, bundled into each host; this turns
 * the frontmatter + body into `BuiltinSkill`s the router and slash palette use.
 *
 * Core stays pure: callers read the files and pass content strings in (same
 * contract as parseWorkspaceInstructions). Malformed or duplicate entries are
 * skipped with a warning rather than throwing, so one bad file can't sink the
 * rest — the host decides whether to fall back to BUILTIN_SKILLS_FALLBACK.
 */
export function parseBuiltinSkills(
  sources: WorkspaceInstructionSource[],
): ParseBuiltinSkillsResult {
  const skills: BuiltinSkill[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  for (const source of sources) {
    const split = splitFrontmatter(source.content);

    if (split === undefined) {
      warnings.push(`${source.path}: missing YAML frontmatter`);
      continue;
    }

    const { scalars, lists } = parseFrontmatter(split.frontmatter);
    const { id, name, description } = scalars;
    const body = split.body;

    if (
      id === undefined ||
      id.length === 0 ||
      name === undefined ||
      name.length === 0 ||
      description === undefined ||
      description.length === 0
    ) {
      warnings.push(`${source.path}: missing required field (id, name, description)`);
      continue;
    }

    if (body.length === 0) {
      warnings.push(`${source.path}: empty skill body`);
      continue;
    }

    if (seenIds.has(id)) {
      warnings.push(`${source.path}: duplicate skill id "${id}"`);
      continue;
    }

    seenIds.add(id);

    const slashCommands = lists.slashCommands ?? [];
    const keywords = lists.keywords ?? [];

    if (slashCommands.length === 0 && keywords.length === 0) {
      // Not fatal — the skill can still be pinned by id — but it can't be
      // reached by slash or keyword, which is almost always a mistake.
      warnings.push(`${source.path}: skill "${id}" has no slashCommands or keywords`);
    }

    skills.push({
      kind: "skill",
      path: source.path,
      id,
      name,
      description,
      body,
      slashCommands,
      keywords,
    });
  }

  return { skills, warnings };
}
