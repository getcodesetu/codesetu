/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import {
  buildActionUserMessage,
  type IdeActionId,
  type WorkspaceInstruction,
} from "@codesetu/core";
import * as vscode from "vscode";

import { ChatPanel, type ChatResponder } from "./chatPanel";
import { collectVSCodeContext } from "./ideContext";

interface RegisterCodeActionsOptions {
  context: vscode.ExtensionContext;
  responder: ChatResponder;
  outputChannel: vscode.OutputChannel;
  loadInstructions(): Promise<readonly WorkspaceInstruction[]>;
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
      const ideContext = await collectVSCodeContext();
      const instructions = await options.loadInstructions();
      const message = buildActionUserMessage(actionId, ideContext, [...instructions]);

      await ChatPanel.createOrShowAndSend(
        options.context.extensionUri,
        options.responder,
        options.outputChannel,
        message,
      );
    }),
  );
}
