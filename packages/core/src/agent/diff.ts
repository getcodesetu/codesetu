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

/** Split text into lines, treating empty text as zero lines (not one blank). */
function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.split("\n");
}

/**
 * Build the LCS length table for two line arrays. `lcs[i][j]` is the length of
 * the longest common subsequence of `a[i:]` and `b[j:]`. Shared by the textual
 * diff and the structured hunk builder so both agree on what changed.
 */
function lcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    const row = lcs[i]!;
    const next = lcs[i + 1]!;
    for (let j = n - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  return lcs;
}

/**
 * Produce a line-oriented diff between two texts, prefixing each line with
 * " " (unchanged), "-" (removed), or "+" (added). Uses an LCS so it shows the
 * minimal real change, not a naive line-by-line compare. Output is capped so a
 * huge change can't flood an approval prompt.
 */
export function diffLines(oldText: string, newText: string, maxLines = MAX_DIFF_LINES): string {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const m = a.length;
  const n = b.length;
  const lcs = lcsTable(a, b);

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

/**
 * One contiguous change between two texts: the removed lines and the lines that
 * replace them. A pure insertion has empty `oldLines`; a pure deletion has empty
 * `newLines`. `oldStart` is the 0-based line index in the original text where
 * the change begins, so a subset of hunks can be applied independently.
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: string[];
  newLines: string[];
}

/**
 * Break the change from `oldText` to `newText` into independent hunks — maximal
 * runs of removed/added lines separated by unchanged context. Powers per-hunk
 * accept/reject: each hunk can be kept or dropped on its own.
 */
export function computeHunks(oldText: string, newText: string): DiffHunk[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const m = a.length;
  const n = b.length;
  const lcs = lcsTable(a, b);

  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  const ensure = (oldIndex: number): DiffHunk => {
    if (current === null) {
      current = { oldStart: oldIndex, oldLines: [], newLines: [] };
    }
    return current;
  };
  const flush = (): void => {
    if (current !== null) {
      hunks.push(current);
      current = null;
    }
  };

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      flush();
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      ensure(i).oldLines.push(a[i]!);
      i += 1;
    } else {
      ensure(i).newLines.push(b[j]!);
      j += 1;
    }
  }
  while (i < m) {
    ensure(i).oldLines.push(a[i]!);
    i += 1;
  }
  while (j < n) {
    ensure(i).newLines.push(b[j]!);
    j += 1;
  }
  flush();
  return hunks;
}

/**
 * Reconstruct the text that results from accepting only the hunks whose indices
 * are in `accepted` (indices into the `hunks` array). Rejected hunks keep their
 * original lines, so accepting every hunk reproduces the full new text and
 * accepting none reproduces the original.
 */
export function applyHunks(
  oldText: string,
  hunks: readonly DiffHunk[],
  accepted: Iterable<number>,
): string {
  const a = splitLines(oldText);
  const acceptedSet = new Set(accepted);
  const ordered = hunks
    .map((hunk, index) => ({ hunk, index }))
    .sort((x, y) => x.hunk.oldStart - y.hunk.oldStart);

  const out: string[] = [];
  let cursor = 0;
  for (const { hunk, index } of ordered) {
    while (cursor < hunk.oldStart) {
      out.push(a[cursor]!);
      cursor += 1;
    }
    if (acceptedSet.has(index)) {
      out.push(...hunk.newLines);
    } else {
      out.push(...hunk.oldLines);
    }
    cursor += hunk.oldLines.length;
  }
  while (cursor < a.length) {
    out.push(a[cursor]!);
    cursor += 1;
  }
  return out.join("\n");
}
