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
  PLAN_MODE_SKILL_ID,
  buildCodeSetuSystemMessage,
  buildContextMarkdown,
  createProvider,
  createSpeechProvider,
  isPlanModeApproval,
  routeSkills,
  type AudioBlob,
  type ChatCompletionRequest,
  type ChatMessage,
  type ChatStreamChunk,
  type IdeContextPayload,
  type ProviderFactoryOptions,
  type SpeechProvider,
  type WorkspaceInstruction,
} from "@codesetu/core";
import * as vscode from "vscode";

import { AGENT_MODE_SYSTEM_NOTE, runAgentTurn } from "./agentRunner";
import { completeAssistantText } from "./chatCompletionRetry";
import { ChatPanel, type ChatResponder, type ContextPreview, type SpeechBridge } from "./chatPanel";
import { resolveAssistantResponse } from "./chatStreaming";
import { registerCodeSetuEditorActions } from "./codeActions";
import { CodeSetuInlineCompletionProvider } from "./completionProvider";
import { readCodeSetuConfiguration, summarizeCodeSetuConfiguration } from "./configuration";
import { collectVSCodeContext, trackActiveEditor } from "./ideContext";
import { selectCodeSetuModel } from "./modelPicker";
import { formatChatProviderLine, runCodeSetuProviderDiagnostics } from "./providerDiagnostics";
import { setupCodeSetuProvider } from "./providerSetup";
import { loadBuiltinSkills } from "./skills";
import {
  getStoredApiKey,
  getStoredSpeechApiKey,
  migrateApiKeyFromConfiguration,
} from "./secretStorage";
import { readSpeechConfiguration } from "./speechConfiguration";
import { setupCodeSetuSpeechProvider } from "./speechSetup";
import { loadWorkspaceInstructions } from "./workspaceInstructions";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel("CodeSetu");
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "CodeSetu: Ready";
  statusBarItem.tooltip = "CodeSetu is ready";
  statusBarItem.command = "codesetu.openChat";
  statusBarItem.show();

  // Remember the last real editor so chat context survives the webview taking
  // focus (vscode.window.activeTextEditor goes undefined while the panel is up).
  context.subscriptions.push(trackActiveEditor(vscode));

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

  // Built-in skills load once from the bundled SKILL.md files (single source of
  // truth); falls back to the constants if the bundle is missing/unparseable.
  const builtinSkills = await loadBuiltinSkills(context, outputChannel);
  ChatPanel.configureBuiltinSkills(builtinSkills);

  const responder: ChatResponder = async (messages, requestContext) => {
    const configuration = readCodeSetuConfiguration();
    const lastUserText = lastUserMessageText(messages);
    // If the user explicitly approved the plan (typed APPROVED / RUN, or hit
    // the Approve & Run button which sends the canonical phrase), this turn
    // should NOT be pinned to plan-mode — they want the implementation now,
    // not another plan.
    const planModeActive = requestContext?.planMode === true && !isPlanModeApproval(lastUserText);
    const routed = routeSkills({
      userText: lastUserText,
      skills: builtinSkills,
      pinnedIds: planModeActive ? [PLAN_MODE_SKILL_ID] : [],
      autoRoute: configuration.skillsAutoRoute,
    });

    // Strip the leading slash from the message sent to the model — the routed
    // skill body in the system prompt already encodes what the command meant,
    // and the chat history keeps the user's literal text for display.
    const providerMessages =
      routed.consumedSlash !== undefined && routed.cleanedUserText !== lastUserText
        ? withLastUserMessage(messages, routed.cleanedUserText)
        : messages;

    const ideContext =
      requestContext?.ideContext ??
      ((requestContext?.includeIdeContext ?? true) ? await collectVSCodeContext() : {});
    const instructions = await loadInstructions();

    // Surface exactly what we're about to send — selected code, routed skills,
    // and the full assembled payload — for the chat's "Context sent to AI" panel.
    requestContext?.onContextPreview?.(
      buildContextPreview(ideContext, routed.selected, instructions, builtinSkills),
    );

    if (requestContext?.agentMode === true) {
      return sendAgentChatRequest(
        providerMessages,
        buildProviderOptions(),
        statusBarItem,
        outputChannel,
        instructions,
        ideContext,
        requestContext?.onChunk,
        routed.selected,
      );
    }

    return sendChatRequest(
      providerMessages,
      buildProviderOptions(),
      statusBarItem,
      outputChannel,
      instructions,
      ideContext,
      requestContext?.onChunk,
      routed.selected,
    );
  };

  const buildSpeechBridge = (): SpeechBridge =>
    buildHostSpeechBridge(context.secrets, outputChannel);

  const openChatCommand = vscode.commands.registerCommand("codesetu.openChat", () => {
    ChatPanel.createOrShow(context.extensionUri, responder, outputChannel, buildSpeechBridge());
  });
  const setupProviderCommand = vscode.commands.registerCommand("codesetu.setupProvider", () =>
    setupCodeSetuProvider(context.secrets),
  );
  const setupSpeechProviderCommand = vscode.commands.registerCommand(
    "codesetu.setupSpeechProvider",
    () => setupCodeSetuSpeechProvider(context.secrets),
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
    speechBridge: buildSpeechBridge,
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
    setupSpeechProviderCommand,
    diagnoseProviderCommand,
    selectModelCommand,
    ...editorActions,
    homeView,
  );
}

function buildHostSpeechBridge(
  secrets: vscode.SecretStorage,
  outputChannel: vscode.OutputChannel,
): SpeechBridge {
  // Build the SpeechProvider lazily per request so settings changes (provider,
  // baseURL, model, language) take effect without re-opening the chat panel.
  const resolveProvider = async (): Promise<SpeechProvider> => {
    const speech = readSpeechConfiguration();
    if (speech.sttProvider === "browser") {
      throw new Error(
        'Speech provider is "browser" — this path is handled in the webview, the host should not be called.',
      );
    }
    const apiKey = await getStoredSpeechApiKey(secrets);
    if (apiKey === undefined) {
      throw new Error('No speech API key set. Run "CodeSetu: Setup Speech Provider".');
    }
    const { provider } = createSpeechProvider({
      provider: speech.sttProvider,
      apiKey,
      ...(speech.sttBaseUrl.length === 0 ? {} : { baseURL: speech.sttBaseUrl }),
      ...(speech.sttModel.length === 0 ? {} : { model: speech.sttModel }),
      language: speech.language,
    });
    if (provider === null) {
      throw new Error(`Speech provider "${speech.sttProvider}" has no host-side implementation.`);
    }
    return provider;
  };

  return {
    transcribe: async (audio: AudioBlob, language: string) => {
      const provider = await resolveProvider();
      outputChannel.appendLine(
        `Speech.transcribe via ${provider.id} (${audio.bytes.byteLength} bytes, ${audio.mimeType})`,
      );
      return provider.transcribe(audio, { language });
    },
  };
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
  onChunk?: (chunk: ChatStreamChunk) => void,
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

/**
 * Agent-mode counterpart to sendChatRequest: assembles the same system prompt +
 * IDE context, appends the agent note, and drives the tool-calling loop instead
 * of a single completion. Tool activity and the final answer stream back through
 * `onChunk`, so the chat renders the agent's work as it happens.
 */
async function sendAgentChatRequest(
  messages: ChatMessage[],
  providerOptions: ProviderFactoryOptions,
  statusBarItem: vscode.StatusBarItem,
  outputChannel: vscode.OutputChannel,
  instructions: readonly WorkspaceInstruction[] = [],
  ideContext: IdeContextPayload = {},
  onChunk?: (chunk: ChatStreamChunk) => void,
  pinnedSkills: readonly WorkspaceInstruction[] = [],
): Promise<string> {
  const configuration = readCodeSetuConfiguration();
  outputChannel.appendLine(
    formatChatProviderLine(summarizeCodeSetuConfiguration(providerOptions.apiKey)),
  );
  const provider = createProvider(providerOptions);
  statusBarItem.text = "CodeSetu: Working";

  const contextualMessages = hasIdeContext(ideContext)
    ? [
        {
          role: "user" as const,
          content: `Current IDE context:\n\n${buildContextMarkdown(ideContext)}`,
        },
        ...messages,
      ]
    : messages;

  const systemContent = [
    buildCodeSetuSystemMessage([...instructions], { pinnedSkills: [...pinnedSkills] }),
    AGENT_MODE_SYSTEM_NOTE,
  ].join("\n\n");

  try {
    return await runAgentTurn({
      provider,
      messages: [{ role: "system", content: systemContent }, ...contextualMessages],
      maxTokens: configuration.chatMaxTokens,
      temperature: configuration.chatTemperature,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      ...(onChunk === undefined ? {} : { onChunk }),
      outputChannel,
    });
  } catch (error: unknown) {
    outputChannel.appendLine(`Agent turn failed: ${formatErrorMessage(error)}`);
    throw error;
  } finally {
    statusBarItem.text = "CodeSetu: Ready";
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lastUserMessageText(messages: readonly ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user" && typeof message.content === "string") {
      return message.content;
    }
  }
  return "";
}

function withLastUserMessage(messages: readonly ChatMessage[], newContent: string): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user") {
      const copy = messages.slice();
      copy[i] = { ...message, content: newContent };
      return copy;
    }
  }
  return [...messages];
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

/**
 * Assemble the "Context sent to AI" preview from the same pieces the request is
 * built from — so the panel shows exactly what the model receives: routed
 * skills (with their slash), the IDE context summary (selection, file,
 * snippets), and the full system prompt + context markdown for deep inspection.
 */
function buildContextPreview(
  ideContext: IdeContextPayload,
  selectedSkills: readonly WorkspaceInstruction[],
  instructions: readonly WorkspaceInstruction[],
  builtinSkills: readonly { id: string; slashCommands: readonly string[] }[],
): ContextPreview {
  const selection = ideContext.selectedText;
  return {
    skills: selectedSkills.map((skill) => {
      const slash = builtinSkills.find((b) => b.id === skill.id)?.slashCommands[0];
      return { name: skill.name, ...(slash === undefined ? {} : { slash }) };
    }),
    ideContext: {
      ...(ideContext.activeFilePath === undefined
        ? {}
        : { activeFilePath: ideContext.activeFilePath }),
      ...(ideContext.languageId === undefined ? {} : { languageId: ideContext.languageId }),
      hasSelection: selection !== undefined && selection.length > 0,
      ...(selection === undefined ? {} : { selectedText: selection }),
      snippetCount: ideContext.relatedSnippets?.length ?? 0,
    },
    full: {
      systemPrompt: buildCodeSetuSystemMessage([...instructions], {
        pinnedSkills: [...selectedSkills],
      }),
      contextMarkdown: hasIdeContext(ideContext) ? buildContextMarkdown(ideContext) : "",
    },
  };
}
