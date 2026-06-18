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

import type { LlmProvider } from "../providers/base.js";
import type { ProviderFactoryOptions } from "../providers/registry.js";

export const IDE_ACTION_IDS = [
  "explain",
  "refactor",
  "write-tests",
  "fix-bug",
  "add-docs",
] as const;

export type IdeActionId = (typeof IDE_ACTION_IDS)[number];

export interface WorkspaceSnippet {
  path: string;
  languageId?: string;
  text: string;
}

export interface IdeContextPayload {
  activeFilePath?: string;
  activeFileText?: string;
  languageId?: string;
  selectedText?: string;
  cursorPrefix?: string;
  cursorSuffix?: string;
  relatedSnippets?: WorkspaceSnippet[];
  /**
   * Files the user explicitly pinned into the conversation (via @-mentions in
   * the chat composer). Unlike relatedSnippets — which are auto-collected and
   * heuristic — these are deliberate, so they're rendered as their own section
   * and the model is told they were chosen on purpose.
   */
  pinnedFiles?: WorkspaceSnippet[];
}

export interface WorkspaceInstructionSource {
  kind: "skill" | "check";
  path: string;
  content: string;
}

export interface WorkspaceInstruction {
  kind: "skill" | "check";
  path: string;
  id: string;
  name: string;
  description: string;
  body: string;
}

export interface WorkspaceInstructionParseResult {
  skills: WorkspaceInstruction[];
  checks: WorkspaceInstruction[];
  warnings: string[];
}

export type ProviderDiagnosticStatus = "ok" | "missing-config" | "error";

export interface ProviderDiagnostic {
  status: ProviderDiagnosticStatus;
  message: string;
  provider: string;
  baseURL: string;
  model: string;
  hasApiKey: boolean;
  latencyMs?: number;
}

export interface DiagnoseProviderOptions {
  providerOptions?: ProviderFactoryOptions;
  createProvider?: (options?: ProviderFactoryOptions) => LlmProvider;
}
