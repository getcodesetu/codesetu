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

// Rough chars-per-token ratio for mixed English + code. A real tokenizer would
// be exact but heavy; this heuristic is plenty for a "how full is the context"
// gauge and stays dependency-free across every provider/model CodeSetu targets.
const CHARS_PER_TOKEN = 4;

/** Approximate the token count of a single string. */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Approximate the combined token count of several text parts. */
export function estimateTokensForParts(parts: readonly string[]): number {
  return parts.reduce((sum, part) => sum + estimateTokens(part), 0);
}

/** Compact human label for a token count, e.g. 850 → "850", 12_300 → "12.3k". */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) {
    return String(tokens);
  }
  return `${(tokens / 1000).toFixed(1)}k`;
}
