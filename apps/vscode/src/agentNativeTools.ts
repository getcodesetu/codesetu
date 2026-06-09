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

import path from "node:path";

import { formatDiagnostics, type AgentTool, type Diagnostic } from "@codesetu/core";
import * as vscode from "vscode";

/**
 * IDE-native agent tools backed by the VSCode API — the things a terminal agent
 * can't reach. These are read-only, so they're auto-approved by the loop.
 */
export function createVscodeNativeTools(root: string | undefined): AgentTool[] {
  return [createGetDiagnosticsTool(root)];
}

function createGetDiagnosticsTool(root: string | undefined): AgentTool {
  return {
    name: "get_diagnostics",
    description:
      "Get the IDE's current errors and warnings (the squiggles from the " +
      "language server / linters) for the workspace or a single file. Use this " +
      "to confirm a change is clean instead of running a full build.",
    risk: "safe",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {
        path: {
          type: "string",
          description: "Limit to this file (workspace-relative or absolute). Omit for all files.",
        },
        severity: {
          type: "string",
          enum: ["error", "warning", "all"],
          description: 'Minimum severity to include (default "warning" = errors + warnings).',
        },
      },
    },
    execute(args) {
      const severity = typeof args.severity === "string" ? args.severity : "warning";
      // vscode.DiagnosticSeverity: Error=0, Warning=1, Information=2, Hint=3.
      const maxSeverity = severity === "error" ? 0 : severity === "all" ? 3 : 1;
      const targetFsPath =
        typeof args.path === "string" && args.path.length > 0
          ? path.resolve(root ?? process.cwd(), args.path)
          : undefined;

      const collected: Diagnostic[] = [];
      for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
        if (targetFsPath !== undefined && uri.fsPath !== targetFsPath) {
          continue;
        }
        const displayPath = root === undefined ? uri.fsPath : path.relative(root, uri.fsPath);
        for (const diagnostic of diagnostics) {
          if (diagnostic.severity > maxSeverity) {
            continue;
          }
          collected.push({
            path: displayPath,
            line: diagnostic.range.start.line + 1,
            severity: mapSeverity(diagnostic.severity),
            message: diagnostic.message,
          });
        }
      }
      return Promise.resolve({ content: formatDiagnostics(collected) });
    },
  };
}

function mapSeverity(severity: vscode.DiagnosticSeverity): Diagnostic["severity"] {
  if (severity === vscode.DiagnosticSeverity.Error) {
    return "error";
  }
  if (severity === vscode.DiagnosticSeverity.Warning) {
    return "warning";
  }
  return "info";
}
