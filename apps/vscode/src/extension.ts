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

import { createProvider, getAssistantText, type ChatMessage } from "@codesetu/core";
import * as vscode from "vscode";

import { ChatPanel } from "./chatPanel";
import { CodeSetuInlineCompletionProvider } from "./completionProvider";
import { readCodeSetuConfiguration } from "./configuration";

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("CodeSetu");
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "CodeSetu: Ready";
  statusBarItem.tooltip = "CodeSetu is ready";
  statusBarItem.command = "codesetu.openChat";
  statusBarItem.show();

  const inlineCompletionProvider = vscode.languages.registerInlineCompletionItemProvider(
    { scheme: "file" },
    new CodeSetuInlineCompletionProvider({
      createProvider: () => createProvider(readCodeSetuConfiguration().providerOptions),
      getConfiguration: readCodeSetuConfiguration,
      outputChannel,
    }),
  );

  const openChatCommand = vscode.commands.registerCommand("codesetu.openChat", () => {
    ChatPanel.createOrShow(
      context.extensionUri,
      async (messages) => sendChatRequest(messages, statusBarItem, outputChannel),
      outputChannel,
    );
  });

  context.subscriptions.push(
    statusBarItem,
    outputChannel,
    inlineCompletionProvider,
    openChatCommand,
  );
}

export function deactivate(): void {
  return undefined;
}

async function sendChatRequest(
  messages: ChatMessage[],
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel,
): Promise<string> {
  const configuration = readCodeSetuConfiguration();
  const provider = createProvider(configuration.providerOptions);
  statusBarItem.text = "CodeSetu: Thinking";

  try {
    const completion = await provider.chat({
      messages: [
        {
          role: "system",
          content:
            "You are CodeSetu, an AI coding assistant for Indian developers. Be concise, correct, and practical.",
        },
        ...messages,
      ],
      maxTokens: configuration.chatMaxTokens,
      temperature: configuration.chatTemperature,
    });
    const text = getAssistantText(completion).trim();

    return text.length === 0 ? "CodeSetu did not return any text." : text;
  } catch (error: unknown) {
    outputChannel.appendLine(`Chat completion failed: ${formatErrorMessage(error)}`);
    throw error;
  } finally {
    statusBarItem.text = "CodeSetu: Ready";
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
