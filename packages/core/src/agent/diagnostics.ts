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

export type DiagnosticSeverity = "error" | "warning" | "info";

/** One IDE diagnostic (a "squiggle"), normalized across hosts. */
export interface Diagnostic {
  /** Workspace-relative path when possible, else absolute. */
  path: string;
  /** 1-based line number. */
  line: number;
  severity: DiagnosticSeverity;
  message: string;
}

/** Cap diagnostics output so a noisy project can't flood the model's context. */
export const MAX_DIAGNOSTICS = 100;

/**
 * Render diagnostics as `path:line: [severity] message`, errors first, capped.
 * Shared by the VSCode and JetBrains get_diagnostics tools so their output reads
 * identically regardless of which IDE produced the squiggles.
 */
export function formatDiagnostics(
  diagnostics: readonly Diagnostic[],
  maxLines = MAX_DIAGNOSTICS,
): string {
  if (diagnostics.length === 0) {
    return "No diagnostics found.";
  }

  const rank: Record<DiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };
  const sorted = [...diagnostics].sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) {
      return rank[a.severity] - rank[b.severity];
    }
    return a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path);
  });

  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const header = `${errors} error(s), ${warnings} warning(s)`;
  const lines = sorted.map((d) => `${d.path}:${d.line}: [${d.severity}] ${d.message}`);

  if (lines.length <= maxLines) {
    return `${header}\n${lines.join("\n")}`;
  }
  const omitted = lines.length - maxLines;
  return `${header}\n${lines.slice(0, maxLines).join("\n")}\n... (${omitted} more)`;
}
