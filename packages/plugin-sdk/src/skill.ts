/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * A skill is a named capability the assistant can opt into for a given turn.
 * Skills are typically authored as a SKILL.md file with YAML frontmatter under
 * /skills/<skill-id>/SKILL.md and loaded by the host at activation time.
 *
 * The host decides when to surface a skill to the model — usually by matching
 * the user's intent against `description` or `whenToUse` text via a routing pass.
 */
export interface SkillManifest {
  /** kebab-case unique id, e.g. "indic-code-comments". */
  id: string;
  /** Human-readable title for UI surfaces. */
  name: string;
  /** One-line summary used by the router to decide relevance. */
  description: string;
  /** Longer "when to use" guidance — included verbatim in the routing prompt. */
  whenToUse?: string;
  /** Optional list of tool ids the skill expects to be available. */
  requiredTools?: readonly string[];
  /**
   * The skill body the assistant reads when activated. Either inline content or
   * a relative path to a SKILL.md file. Hosts may stream the file in chunks.
   */
  body: { type: "inline"; content: string } | { type: "file"; path: string };
}
