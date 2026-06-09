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

/** Cap a diff so the approval prompt stays readable. */
export const MAX_DIFF_LINES = 80;

/**
 * Produce a line-oriented diff between two texts, prefixing each line with
 * " " (unchanged), "-" (removed), or "+" (added). Uses an LCS so it shows the
 * minimal real change, not a naive line-by-line compare. Output is capped so a
 * huge change can't flood an approval prompt.
 */
export function diffLines(oldText: string, newText: string, maxLines = MAX_DIFF_LINES): string {
  const a = oldText.length === 0 ? [] : oldText.split("\n");
  const b = newText.length === 0 ? [] : newText.split("\n");
  const m = a.length;
  const n = b.length;

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    const row = lcs[i]!;
    const next = lcs[i + 1]!;
    for (let j = n - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push(` ${a[i]!}`);
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push(`-${a[i]!}`);
      i += 1;
    } else {
      out.push(`+${b[j]!}`);
      j += 1;
    }
  }
  while (i < m) {
    out.push(`-${a[i]!}`);
    i += 1;
  }
  while (j < n) {
    out.push(`+${b[j]!}`);
    j += 1;
  }

  if (out.length <= maxLines) {
    return out.join("\n");
  }
  const omitted = out.length - maxLines;
  return `${out.slice(0, maxLines).join("\n")}\n... (${omitted} more diff lines)`;
}
