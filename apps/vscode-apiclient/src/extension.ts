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

import * as vscode from "vscode";

import { ApiClientPanel } from "./apiClientPanel";
import { ApiClientStorage } from "./storage";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("CodeSetu API Client");
  const storage = new ApiClientStorage(context, outputChannel);

  const openPanel = (): Promise<ApiClientPanel> =>
    ApiClientPanel.createOrShow(context.extensionUri, storage, outputChannel);

  const openCommand = vscode.commands.registerCommand("codesetuApi.open", () => {
    void openPanel();
  });
  const newRequestCommand = vscode.commands.registerCommand("codesetuApi.newRequest", () => {
    void openPanel();
  });
  const importCommand = vscode.commands.registerCommand("codesetuApi.importCollection", () => {
    void openPanel().then((panel) => panel.triggerImport());
  });

  const homeView = vscode.window.registerTreeDataProvider("codesetuApiHome", {
    getTreeItem: (item: vscode.TreeItem) => item,
    getChildren: () => [],
  });

  context.subscriptions.push(
    outputChannel,
    openCommand,
    newRequestCommand,
    importCommand,
    homeView,
  );
}

export function deactivate(): void {
  return undefined;
}
