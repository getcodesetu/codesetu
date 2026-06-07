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

import { parseFrontmatter, splitFrontmatter } from "./frontmatter.js";
import type {
  WorkspaceInstruction,
  WorkspaceInstructionParseResult,
  WorkspaceInstructionSource,
} from "./types.js";

const REQUIRED_FIELDS = ["id", "name", "description"] as const;

export function parseWorkspaceInstructions(
  sources: WorkspaceInstructionSource[],
): WorkspaceInstructionParseResult {
  const result: WorkspaceInstructionParseResult = {
    skills: [],
    checks: [],
    warnings: [],
  };
  const seenIds = new Set<string>();

  for (const source of sources) {
    const parsed = parseSource(source);

    if (parsed.warning !== undefined) {
      result.warnings.push(parsed.warning);
      continue;
    }

    const instruction = parsed.instruction;

    if (seenIds.has(instruction.id)) {
      result.warnings.push(`${source.path}: duplicate instruction id "${instruction.id}"`);
      continue;
    }

    seenIds.add(instruction.id);

    if (instruction.kind === "skill") {
      result.skills.push(instruction);
    } else {
      result.checks.push(instruction);
    }
  }

  return result;
}

function parseSource(
  source: WorkspaceInstructionSource,
):
  | { instruction: WorkspaceInstruction; warning?: never }
  | { instruction?: never; warning: string } {
  const split = splitFrontmatter(source.content);

  if (split === undefined) {
    return { warning: `${source.path}: missing YAML frontmatter` };
  }

  const { body } = split;
  const fields = parseFrontmatter(split.frontmatter).scalars;

  for (const field of REQUIRED_FIELDS) {
    const value = fields[field];

    if (value === undefined || value.length === 0) {
      return { warning: `${source.path}: missing required field "${field}"` };
    }
  }

  if (body.length === 0) {
    return { warning: `${source.path}: empty instruction body` };
  }

  const { id, name, description } = fields;

  if (id === undefined || name === undefined || description === undefined) {
    return { warning: `${source.path}: missing required frontmatter` };
  }

  return {
    instruction: {
      kind: source.kind,
      path: source.path,
      id,
      name,
      description,
      body,
    },
  };
}
