/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { IdeContextPayload, WorkspaceSnippet } from "@codesetu/core";
import type * as vscodeTypes from "vscode";

type VSCodeApi = typeof vscodeTypes;
type VSCodeUri = vscodeTypes.Uri;

export interface BuildEditorContextOptions {
  activeFilePath?: string;
  languageId?: string;
  text: string;
  selectionStart: number;
  selectionEnd: number;
  maxActiveFileChars?: number;
  maxCursorChars?: number;
  relatedSnippets?: readonly WorkspaceSnippet[];
}

export function buildEditorContext(options: BuildEditorContextOptions): IdeContextPayload {
  const maxActiveFileChars = options.maxActiveFileChars ?? 12_000;
  const maxCursorChars = options.maxCursorChars ?? 2_000;
  const selectionStart = clamp(options.selectionStart, 0, options.text.length);
  const selectionEnd = clamp(options.selectionEnd, selectionStart, options.text.length);

  return {
    activeFilePath: options.activeFilePath,
    activeFileText: trimMiddle(options.text, maxActiveFileChars),
    languageId: options.languageId,
    selectedText: options.text.slice(selectionStart, selectionEnd),
    cursorPrefix: options.text.slice(Math.max(0, selectionStart - maxCursorChars), selectionStart),
    cursorSuffix: options.text.slice(
      selectionEnd,
      Math.min(options.text.length, selectionEnd + maxCursorChars),
    ),
    relatedSnippets: [...(options.relatedSnippets ?? [])],
  };
}

// When the chat webview panel has focus, vscode.window.activeTextEditor is
// undefined — so capturing context "live" on send would drop the user's
// selection and active file. We remember the last real text editor and fall
// back to it. Its `.selection` stays current even after it loses focus.
let lastActiveEditor: vscodeTypes.TextEditor | undefined;

/**
 * Start tracking the active text editor so collectVSCodeContext can recover the
 * user's selection after the chat webview steals focus. Call once at activation;
 * returns a Disposable to register in the extension's subscriptions.
 */
export function trackActiveEditor(vscode: VSCodeApi): vscodeTypes.Disposable {
  if (vscode.window.activeTextEditor !== undefined) {
    lastActiveEditor = vscode.window.activeTextEditor;
  }
  return vscode.window.onDidChangeActiveTextEditor((editor) => {
    // Ignore the transition to `undefined` (a webview/panel gained focus) —
    // keep the last real editor so its selection survives.
    if (editor !== undefined) {
      lastActiveEditor = editor;
    }
  });
}

export async function collectVSCodeContext(): Promise<IdeContextPayload> {
  const vscode: VSCodeApi = await import("vscode");
  const editor = vscode.window.activeTextEditor ?? lastActiveEditor;

  if (editor === undefined) {
    return {};
  }

  const document = editor.document;
  const selection = editor.selection;
  const text = document.getText();
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const activeFilePath =
    workspaceFolder === undefined
      ? document.uri.fsPath
      : vscode.workspace.asRelativePath(document.uri, false);

  return buildEditorContext({
    activeFilePath,
    languageId: document.languageId,
    text,
    selectionStart: document.offsetAt(selection.start),
    selectionEnd: document.offsetAt(selection.end),
    relatedSnippets: await collectWorkspaceSnippets(vscode, document.uri),
  });
}

async function collectWorkspaceSnippets(
  vscode: VSCodeApi,
  activeUri: VSCodeUri,
): Promise<WorkspaceSnippet[]> {
  const files = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,py,java,kt,go,rs,md,json,yml,yaml}",
    // Skip build output and likely-secret files so they aren't auto-sent to the provider.
    "{**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.env*,**/*.pem,**/*.key,**/*.pfx,**/*.p12,**/secrets/**,**/.aws/**,**/id_rsa*}",
    8,
  );
  const snippets: WorkspaceSnippet[] = [];

  for (const file of files) {
    if (file.toString() === activeUri.toString()) {
      continue;
    }

    const document = await vscode.workspace.openTextDocument(file);
    snippets.push({
      path: vscode.workspace.asRelativePath(file, false),
      languageId: document.languageId,
      text: document.getText().slice(0, 2_000),
    });
  }

  return snippets;
}

function trimMiddle(value: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }

  if (value.length <= maxChars) {
    return value;
  }

  const marker = "\n...[trimmed]...\n";

  if (maxChars <= marker.length) {
    return value.slice(0, maxChars);
  }

  const availableChars = maxChars - marker.length;
  const prefixChars = Math.ceil(availableChars / 2);
  const suffixChars = Math.floor(availableChars / 2);

  return `${value.slice(0, prefixChars)}${marker}${value.slice(-suffixChars)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
