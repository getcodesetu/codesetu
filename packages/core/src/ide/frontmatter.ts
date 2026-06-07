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

/**
 * Minimal YAML-frontmatter reader shared by the workspace-instruction parser
 * and the built-in skill loader. Deliberately tiny — no YAML dependency. It
 * understands two value shapes:
 *   - scalars:  `key: value`            → fields.scalars[key] = "value"
 *   - lists:    `key: [a, b, c]`        → fields.lists[key]   = ["a","b","c"]
 *
 * Constraint: list items must not contain commas (they're the delimiter). All
 * current skill keywords/slash-commands satisfy this, including the Devanagari
 * and Tamil indic keywords.
 */

export interface ParsedFrontmatter {
  scalars: Record<string, string>;
  lists: Record<string, string[]>;
}

/** Split `---`-delimited frontmatter from the markdown body. */
export function splitFrontmatter(
  content: string,
): { frontmatter: string; body: string } | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);

  if (match === null) {
    return undefined;
  }

  return { frontmatter: match[1] ?? "", body: (match[2] ?? "").trim() };
}

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

/** Parse frontmatter lines into scalar and list fields. */
export function parseFrontmatter(frontmatter: string): ParsedFrontmatter {
  const scalars: Record<string, string> = {};
  const lists: Record<string, string[]> = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (key.length === 0) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();

    if (/^\[.*\]$/.test(rawValue)) {
      lists[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => stripQuotes(item.trim()))
        .filter((item) => item.length > 0);
    } else {
      scalars[key] = stripQuotes(rawValue);
    }
  }

  return { scalars, lists };
}
