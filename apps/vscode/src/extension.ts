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
  PLAN_MODE_SKILL,
  buildCodeSetuSystemMessage,
  buildContextMarkdown,
  createProvider,
  type ChatCompletionRequest,
  type ChatMessage,
  type IdeContextPayload,
  type ProviderFactoryOptions,
  type WorkspaceInstruction,
} from "@codesetu/core";
import * as vscode from "vscode";

import { completeAssistantText } from "./chatCompletionRetry";
import { ChatPanel, type ChatResponder } from "./chatPanel";
import { resolveAssistantResponse } from "./chatStreaming";
import { registerCodeSetuEditorActions } from "./codeActions";
import { CodeSetuInlineCompletionProvider } from "./completionProvider";
import { readCodeSetuConfiguration, summarizeCodeSetuConfiguration } from "./configuration";
import { collectVSCodeContext } from "./ideContext";
import { selectCodeSetuModel } from "./modelPicker";
import { formatChatProviderLine, runCodeSetuProviderDiagnostics } from "./providerDiagnostics";
import { setupCodeSetuProvider } from "./providerSetup";
import { getStoredApiKey, migrateApiKeyFromConfiguration } from "./secretStorage";
import { loadWorkspaceInstructions } from "./workspaceInstructions";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("CodeSetu");
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "CodeSetu: Ready";
  statusBarItem.tooltip = "CodeSetu is ready";
  statusBarItem.command = "codesetu.openChat";
  statusBarItem.show();

  // The API key lives in the OS secret store. Migrate any legacy plaintext value
  // out of settings.json, then keep an in-memory copy refreshed on change so the
  // synchronous provider-creation hot paths (inline completions) stay fast.
  await migrateApiKeyFromConfiguration(context.secrets);
  let apiKey = await getStoredApiKey(context.secrets);
  context.subscriptions.push(
    context.secrets.onDidChange((event) => {
      if (event.key === "codesetu.apiKey") {
        void getStoredApiKey(context.secrets).then((value) => {
          apiKey = value;
        });
      }
    }),
  );

  const buildProviderOptions = (): ProviderFactoryOptions => ({
    ...readCodeSetuConfiguration().providerOptions,
    apiKey,
  });

  const inlineCompletionProvider = vscode.languages.registerInlineCompletionItemProvider(
    { scheme: "file" },
    new CodeSetuInlineCompletionProvider({
      createProvider: () => createProvider(buildProviderOptions()),
      getConfiguration: readCodeSetuConfiguration,
      outputChannel,
    }),
  );

  const loadInstructions = async (): Promise<WorkspaceInstruction[]> => {
    const result = await loadWorkspaceInstructions(outputChannel);
    return [...result.skills, ...result.checks];
  };

  const responder: ChatResponder = async (messages, requestContext) =>
    sendChatRequest(
      messages,
      buildProviderOptions(),
      statusBarItem,
      outputChannel,
      await loadInstructions(),
      requestContext?.ideContext ??
        ((requestContext?.includeIdeContext ?? true) ? await collectVSCodeContext() : {}),
      requestContext?.onChunk,
      requestContext?.planMode ? [PLAN_MODE_SKILL] : [],
    );

  const openChatCommand = vscode.commands.registerCommand("codesetu.openChat", () => {
    ChatPanel.createOrShow(context.extensionUri, responder, outputChannel);
  });
  const setupProviderCommand = vscode.commands.registerCommand("codesetu.setupProvider", () =>
    setupCodeSetuProvider(context.secrets),
  );
  const diagnoseProviderCommand = vscode.commands.registerCommand("codesetu.diagnoseProvider", () =>
    runCodeSetuProviderDiagnostics(outputChannel, apiKey),
  );
  const selectModelCommand = vscode.commands.registerCommand("codesetu.selectModel", async () => {
    await selectCodeSetuModel();
    ChatPanel.refreshModelLabel();
  });

  const editorActions = registerCodeSetuEditorActions({
    context,
    responder,
    outputChannel,
  });

  const homeView = vscode.window.registerTreeDataProvider("codesetuHome", {
    getTreeItem: (item: vscode.TreeItem) => item,
    getChildren: () => [],
  });

  context.subscriptions.push(
    statusBarItem,
    outputChannel,
    inlineCompletionProvider,
    openChatCommand,
    setupProviderCommand,
    diagnoseProviderCommand,
    selectModelCommand,
    ...editorActions,
    homeView,
  );
}

export function deactivate(): void {
  return undefined;
}

async function sendChatRequest(
  messages: ChatMessage[],
  providerOptions: ProviderFactoryOptions,
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel,
  instructions: readonly WorkspaceInstruction[] = [],
  ideContext: IdeContextPayload = {},
  onChunk?: (chunk: string) => void,
  pinnedSkills: readonly WorkspaceInstruction[] = [],
): Promise<string> {
  const configuration = readCodeSetuConfiguration();
  outputChannel.appendLine(
    formatChatProviderLine(summarizeCodeSetuConfiguration(providerOptions.apiKey)),
  );
  const provider = createProvider(providerOptions);
  statusBarItem.text = "CodeSetu: Thinking";
  const contextualMessages = hasIdeContext(ideContext)
    ? [
        {
          role: "user" as const,
          content: `Current IDE context:\n\n${buildContextMarkdown(ideContext)}`,
        },
        ...messages,
      ]
    : messages;

  try {
    const request: ChatCompletionRequest = {
      messages: [
        {
          role: "system",
          content: buildCodeSetuSystemMessage([...instructions], {
            pinnedSkills: [...pinnedSkills],
          }),
        },
        ...contextualMessages,
      ],
      maxTokens: configuration.chatMaxTokens,
      temperature: configuration.chatTemperature,
    };

    return await resolveAssistantResponse({
      completeChat: async () =>
        completeAssistantText({
          complete: (maxTokens) => provider.chat({ ...request, maxTokens }),
          emptyMessage: "CodeSetu did not return any text.",
          initialMaxTokens: configuration.chatMaxTokens,
          onRetry: (reason) => outputChannel.appendLine(`Retrying chat completion: ${reason}`),
          retryMaxTokens: Math.max(configuration.chatMaxTokens * 2, 4096),
        }),
      emptyMessage: "CodeSetu did not return any text.",
      onChunk,
      onStreamFallback: (error) => {
        outputChannel.appendLine(
          `Streaming chat failed before response text; retrying without streaming: ${formatErrorMessage(error)}`,
        );
      },
      streamChat: () => provider.streamChat(request),
    });
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

function hasIdeContext(context: IdeContextPayload): boolean {
  return (
    context.activeFilePath !== undefined ||
    context.activeFileText !== undefined ||
    context.languageId !== undefined ||
    context.selectedText !== undefined ||
    context.cursorPrefix !== undefined ||
    context.cursorSuffix !== undefined ||
    (context.relatedSnippets !== undefined && context.relatedSnippets.length > 0)
  );
}
