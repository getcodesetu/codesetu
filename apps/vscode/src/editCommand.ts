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

import {
  applyHunks,
  computeHunks,
  getAssistantText,
  type DiffHunk,
  type LlmProvider,
} from "@codesetu/core";
import * as vscode from "vscode";

import type { CodeSetuConfiguration } from "./configuration";
import { stripCodeFences, spliceText } from "./editText";
import { getActiveOrLastEditor } from "./ideContext";

const EDIT_SCHEME = "codesetu-edit";

const EDIT_SYSTEM_PROMPT = [
  "You are CodeSetu, a precise code-editing assistant.",
  "Rewrite the user's code so it satisfies their instruction.",
  "Return ONLY the revised code — no explanation, no commentary, and no Markdown code fences.",
  "Preserve the surrounding style, indentation, and language.",
].join(" ");

export interface RegisterEditCommandOptions {
  createProvider(): LlmProvider;
  getConfiguration(): CodeSetuConfiguration;
  outputChannel: vscode.OutputChannel;
}

/**
 * Serves the proposed (post-edit) document text to the diff view under the
 * codesetu-edit:// scheme. Read-only and ephemeral — entries are dropped once
 * the user accepts or discards the edit.
 */
class ProposedContentProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  public set(uri: vscode.Uri, text: string): void {
    this.contents.set(uri.toString(), text);
  }

  public delete(uri: vscode.Uri): void {
    this.contents.delete(uri.toString());
  }
}

/**
 * Register the `/edit`-style command: prompt for an instruction, ask the model
 * to rewrite the selection (or whole file), show the change as a diff, and
 * apply it only if the user accepts.
 */
export function registerEditCommand(options: RegisterEditCommandOptions): vscode.Disposable[] {
  const proposed = new ProposedContentProvider();
  const providerRegistration = vscode.workspace.registerTextDocumentContentProvider(
    EDIT_SCHEME,
    proposed,
  );
  let counter = 0;

  const command = vscode.commands.registerCommand(
    "codesetu.editSelection",
    async (presetInstruction?: unknown) => {
      const editor = getActiveOrLastEditor(vscode);
      if (editor === undefined) {
        void vscode.window.showWarningMessage(
          "CodeSetu: open a file (and optionally select code) before running Edit with CodeSetu.",
        );
        return;
      }

      const document = editor.document;
      const range = editor.selection.isEmpty
        ? fullRange(document)
        : new vscode.Range(editor.selection.start, editor.selection.end);
      const target = document.getText(range);
      if (target.trim().length === 0) {
        void vscode.window.showWarningMessage("CodeSetu: nothing to edit — the file is empty.");
        return;
      }

      // When invoked from the chat composer's `/edit <instruction>`, the
      // instruction is passed in and we skip the prompt; otherwise ask for it.
      const preset = typeof presetInstruction === "string" ? presetInstruction.trim() : "";
      const instruction =
        preset.length > 0
          ? preset
          : await vscode.window.showInputBox({
              title: "Edit with CodeSetu",
              prompt: editor.selection.isEmpty
                ? "Describe the change for the whole file"
                : "Describe the change for the selection",
              placeHolder: "e.g. add error handling and JSDoc",
              ignoreFocusOut: true,
            });
      if (instruction === undefined || instruction.trim().length === 0) {
        return;
      }

      let newCode: string;
      try {
        newCode = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: "CodeSetu is editing…" },
          () => requestEdit(options, document.languageId, target, instruction),
        );
      } catch (error: unknown) {
        options.outputChannel.appendLine(`Edit failed: ${formatErrorMessage(error)}`);
        void vscode.window.showErrorMessage(`CodeSetu edit failed: ${formatErrorMessage(error)}`);
        return;
      }

      if (newCode.trim().length === 0) {
        void vscode.window.showWarningMessage("CodeSetu returned no edit.");
        return;
      }

      const proposedFull = spliceText(
        document.getText(),
        document.offsetAt(range.start),
        document.offsetAt(range.end),
        newCode,
      );

      counter += 1;
      const proposedUri = vscode.Uri.from({
        scheme: EDIT_SCHEME,
        path: `/${counter}/${baseName(document.uri)}`,
      });
      proposed.set(proposedUri, proposedFull);

      try {
        await vscode.commands.executeCommand(
          "vscode.diff",
          document.uri,
          proposedUri,
          `CodeSetu edit: ${baseName(document.uri)} (review)`,
          { preview: true },
        );

        const hunks = computeHunks(target, newCode);
        // Only offer per-hunk selection when there's more than one independent
        // change — a single hunk is just the all-or-nothing case.
        const canChooseHunks = hunks.length > 1;
        const actions = canChooseHunks
          ? ["Apply All", "Choose Hunks…", "Discard"]
          : ["Apply", "Discard"];

        const choice = await vscode.window.showInformationMessage(
          "Apply this CodeSetu edit?",
          { modal: false },
          ...actions,
        );

        if (choice === "Apply" || choice === "Apply All") {
          await applyRangeEdit(document.uri, range, newCode);
        } else if (choice === "Choose Hunks…") {
          const accepted = await pickHunks(hunks);
          if (accepted !== undefined) {
            if (accepted.length === 0) {
              void vscode.window.showInformationMessage(
                "CodeSetu: no hunks selected — nothing applied.",
              );
            } else {
              await applyRangeEdit(document.uri, range, applyHunks(target, hunks, accepted));
            }
          }
        }
      } finally {
        proposed.delete(proposedUri);
      }
    },
  );

  return [command, providerRegistration];
}

/** Apply a single range replacement, warning if VS Code rejects it. */
async function applyRangeEdit(uri: vscode.Uri, range: vscode.Range, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, text);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    void vscode.window.showWarningMessage("CodeSetu could not apply the edit.");
  }
}

/**
 * Show a multi-select picker of the edit's hunks (all pre-selected) and return
 * the indices the user kept, or undefined if they cancelled.
 */
async function pickHunks(hunks: readonly DiffHunk[]): Promise<number[] | undefined> {
  interface HunkItem extends vscode.QuickPickItem {
    index: number;
  }
  const items: HunkItem[] = hunks.map((hunk, index) => ({
    index,
    label: `Hunk ${index + 1}`,
    description: `−${hunk.oldLines.length} +${hunk.newLines.length}`,
    detail: hunkPreview(hunk),
    picked: true,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    title: "Choose hunks to apply",
    placeHolder: "Toggle the changes to keep, then press Enter",
    ignoreFocusOut: true,
  });
  if (selected === undefined) {
    return undefined;
  }
  return selected.map((item) => item.index);
}

/** A one-line summary of a hunk for the picker's detail row. */
function hunkPreview(hunk: DiffHunk): string {
  const removed = hunk.oldLines.length > 0 ? `− ${hunk.oldLines[0]!.trim()}` : "";
  const added = hunk.newLines.length > 0 ? `+ ${hunk.newLines[0]!.trim()}` : "";
  return [removed, added]
    .filter((part) => part.length > 0)
    .join("   ")
    .slice(0, 120);
}

async function requestEdit(
  options: RegisterEditCommandOptions,
  languageId: string,
  code: string,
  instruction: string,
): Promise<string> {
  const configuration = options.getConfiguration();
  const provider = options.createProvider();
  const completion = await provider.chat({
    messages: [
      { role: "system", content: EDIT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Language: ${languageId}\nInstruction: ${instruction}\n\nCode:\n${code}`,
      },
    ],
    maxTokens: configuration.chatMaxTokens,
    temperature: configuration.chatTemperature,
  });
  return stripCodeFences(getAssistantText(completion));
}

function fullRange(document: vscode.TextDocument): vscode.Range {
  const last = document.lineCount - 1;
  return new vscode.Range(0, 0, last, document.lineAt(last).text.length);
}

function baseName(uri: vscode.Uri): string {
  const parts = uri.path.split("/");
  return parts[parts.length - 1] ?? uri.path;
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
