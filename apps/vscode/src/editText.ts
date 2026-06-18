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
 * Strip a single wrapping Markdown code fence if the model added one despite
 * being told not to — keeps the applied text as raw code. Leaves text without
 * a leading fence untouched.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return text;
  }
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline === -1) {
    return text;
  }
  const withoutOpen = trimmed.slice(firstNewline + 1);
  const closing = withoutOpen.lastIndexOf("```");
  return closing === -1 ? withoutOpen : withoutOpen.slice(0, closing).replace(/\n$/, "");
}

/** Replace [start, end) of `text` with `replacement` (offsets, not positions). */
export function spliceText(text: string, start: number, end: number, replacement: string): string {
  return text.slice(0, start) + replacement + text.slice(end);
}
