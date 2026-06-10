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
  return [
    createGetDiagnosticsTool(root),
    createFindSymbolTool(root),
    createFindReferencesTool(root),
  ];
}

/** Cap navigation results so a popular symbol can't flood the model's context. */
const MAX_SYMBOL_HITS = 50;
const MAX_REFERENCES = 100;

function displayPath(uri: vscode.Uri, root: string | undefined): string {
  return root === undefined ? uri.fsPath : path.relative(root, uri.fsPath);
}

function createFindSymbolTool(root: string | undefined): AgentTool {
  return {
    name: "find_symbol",
    description:
      "Find where a symbol (class, function, method, variable…) is declared by " +
      "name, across the whole workspace, using the language server. Faster and " +
      "more precise than grep for 'where is X defined'.",
    risk: "safe",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", description: "Symbol name (or part of it) to search for." },
      },
    },
    async execute(args) {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (query.length === 0) {
        return { content: 'Missing required argument "query".', isError: true };
      }
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        "vscode.executeWorkspaceSymbolProvider",
        query,
      );
      if (symbols === undefined || symbols.length === 0) {
        return { content: `No symbols matching "${query}".` };
      }
      const shown = symbols.slice(0, MAX_SYMBOL_HITS);
      const lines = shown.map(
        (symbol) =>
          `${symbol.name} [${symbolKindLabel(symbol.kind)}] — ` +
          `${displayPath(symbol.location.uri, root)}:${symbol.location.range.start.line + 1}`,
      );
      const more =
        symbols.length > shown.length ? `\n... and ${symbols.length - shown.length} more` : "";
      return { content: lines.join("\n") + more };
    },
  };
}

function createFindReferencesTool(root: string | undefined): AgentTool {
  return {
    name: "find_references",
    description:
      "Find all references (usages) of a symbol by name using the language " +
      "server — e.g. who calls a function. Resolves the symbol's definition " +
      "first, then lists the call sites.",
    risk: "safe",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["symbol"],
      properties: {
        symbol: { type: "string", description: "Name of the symbol to find usages of." },
      },
    },
    async execute(args) {
      const symbolName = typeof args.symbol === "string" ? args.symbol.trim() : "";
      if (symbolName.length === 0) {
        return { content: 'Missing required argument "symbol".', isError: true };
      }
      const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        "vscode.executeWorkspaceSymbolProvider",
        symbolName,
      );
      const match =
        symbols?.find((symbol) => symbol.name === symbolName) ?? (symbols ? symbols[0] : undefined);
      if (match === undefined) {
        return { content: `Could not locate a symbol named "${symbolName}".` };
      }
      const references = await vscode.commands.executeCommand<vscode.Location[]>(
        "vscode.executeReferenceProvider",
        match.location.uri,
        match.location.range.start,
      );
      const resolvedAt = `${displayPath(match.location.uri, root)}:${match.location.range.start.line + 1}`;
      if (references === undefined || references.length === 0) {
        return { content: `No references to ${match.name} (resolved at ${resolvedAt}).` };
      }
      const shown = references.slice(0, MAX_REFERENCES);
      const lines = shown.map(
        (reference) => `${displayPath(reference.uri, root)}:${reference.range.start.line + 1}`,
      );
      const more =
        references.length > shown.length
          ? `\n... and ${references.length - shown.length} more`
          : "";
      return {
        content: `References to ${match.name} (resolved at ${resolvedAt}):\n${lines.join("\n")}${more}`,
      };
    },
  };
}

function symbolKindLabel(kind: vscode.SymbolKind): string {
  const labels: Partial<Record<vscode.SymbolKind, string>> = {
    [vscode.SymbolKind.Class]: "class",
    [vscode.SymbolKind.Interface]: "interface",
    [vscode.SymbolKind.Method]: "method",
    [vscode.SymbolKind.Function]: "function",
    [vscode.SymbolKind.Constructor]: "constructor",
    [vscode.SymbolKind.Field]: "field",
    [vscode.SymbolKind.Property]: "property",
    [vscode.SymbolKind.Variable]: "variable",
    [vscode.SymbolKind.Constant]: "constant",
    [vscode.SymbolKind.Enum]: "enum",
    [vscode.SymbolKind.Struct]: "struct",
    [vscode.SymbolKind.Module]: "module",
    [vscode.SymbolKind.Namespace]: "namespace",
  };
  return labels[kind] ?? "symbol";
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
