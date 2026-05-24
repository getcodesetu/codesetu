/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import type { IdeActionId } from "@codesetu/core";
import * as vscode from "vscode";

import { buildEditorActionMessage } from "./actionMessages";
import { ChatPanel, type ChatResponder } from "./chatPanel";

interface RegisterCodeActionsOptions {
  context: vscode.ExtensionContext;
  responder: ChatResponder;
  outputChannel: vscode.OutputChannel;
}

const commandMap: Array<{ command: string; actionId: IdeActionId }> = [
  { command: "codesetu.explainSelection", actionId: "explain" },
  { command: "codesetu.refactorSelection", actionId: "refactor" },
  { command: "codesetu.writeTestsForSelection", actionId: "write-tests" },
  { command: "codesetu.fixBugInSelection", actionId: "fix-bug" },
  { command: "codesetu.addDocsToSelection", actionId: "add-docs" },
];

export function registerCodeSetuEditorActions(
  options: RegisterCodeActionsOptions,
): vscode.Disposable[] {
  return commandMap.map(({ command, actionId }) =>
    vscode.commands.registerCommand(command, async () => {
      const message = buildEditorActionMessage(actionId);

      await ChatPanel.createOrShowAndSend(
        options.context.extensionUri,
        options.responder,
        options.outputChannel,
        message,
      );
    }),
  );
}
