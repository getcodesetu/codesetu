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
  sanitizeToolMessages,
  type AgentTool,
  type ApprovalDecision,
  type ApprovalRequest,
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

import type { WorkspaceCheckpoint } from "./agentCheckpoint";
import { AGENT_MODE_SYSTEM_NOTE, runAgentTurn } from "./agentRunner";
import { completeAssistantText } from "./chatCompletionRetry";
import { ChatPanel, type ChatResponder, type ContextPreview, type SpeechBridge } from "./chatPanel";
import { resolveAssistantResponse } from "./chatStreaming";
import { registerCodeSetuEditorActions } from "./codeActions";
import { CodeSetuInlineCompletionProvider } from "./completionProvider";
import { readCodeSetuConfiguration, summarizeCodeSetuConfiguration } from "./configuration";
import { registerEditCommand } from "./editCommand";
import { collectVSCodeContext, trackActiveEditor } from "./ideContext";
import { readPinnedFiles } from "./pinnedFiles";
import { WorkspaceIndexManager, mentionsWorkspace } from "./workspaceIndex";
import { estimateTokensForParts } from "./tokenEstimate";
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

  // Owns the @workspace semantic index (build, retrieve, agent search tool).
  const workspaceIndex = new WorkspaceIndexManager(() => apiKey, outputChannel);

  // The most recent agent turn's file checkpoint, for one-click revert.
  let lastAgentCheckpoint: WorkspaceCheckpoint | undefined;

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
  // Surface the extension version in the composer so a stale build is obvious.
  const pkgVersion = (context.extension?.packageJSON as { version?: unknown } | undefined)?.version;
  ChatPanel.configureVersion(typeof pkgVersion === "string" ? pkgVersion : "");
  // Persist the chat transcript per-workspace so it survives a reload.
  ChatPanel.configureStorage(context.workspaceState);

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

    const ideContext: IdeContextPayload =
      requestContext?.ideContext ??
      ((requestContext?.includeIdeContext ?? true) ? await collectVSCodeContext() : {});
    // @-pinned files are an explicit user choice, so they're attached even when
    // automatic IDE context is turned off for this turn.
    if (requestContext?.pinnedFiles !== undefined && requestContext.pinnedFiles.length > 0) {
      const pinned = await readPinnedFiles(vscode, requestContext.pinnedFiles);
      if (pinned.length > 0) {
        ideContext.pinnedFiles = pinned;
      }
    }
    // @workspace opts the turn into semantic retrieval: pull the most relevant
    // indexed chunks and attach them as their own context section.
    let workspaceInfo: ContextPreview["workspace"];
    if (mentionsWorkspace(lastUserText)) {
      const k = vscode.workspace.getConfiguration("codesetu").get<number>("workspaceIndex.retrievalK", 8);
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        // No folder open → nothing to index. Tell the user instead of silently
        // answering generically.
        outputChannel.appendLine("[index] @workspace: no workspace folder is open.");
        workspaceInfo = { status: "no-folder", message: "No folder open — use File → Open Folder." };
        void vscode.window.showWarningMessage(
          "CodeSetu @workspace needs an open folder. Use File → Open Folder, then try again.",
        );
      } else {
        try {
          // First use of @workspace auto-builds the index so the user doesn't have
          // to run the command manually. Subsequent turns reuse it.
          if (!(await workspaceIndex.isIndexed())) {
            const summary = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "CodeSetu: building @workspace index…",
              },
              (progress) =>
                workspaceIndex.reindex((done, total) =>
                  progress.report({ message: `embedding ${done}/${total} chunks` }),
                ),
            );
            outputChannel.appendLine(`[index] ${summary}`);
          }
          const indexedChunks = await workspaceIndex.chunkCount();
          const retrieved = await workspaceIndex.retrieve(lastUserText, k);
          if (retrieved.length > 0) {
            ideContext.retrievedSnippets = retrieved;
            outputChannel.appendLine(`[index] @workspace retrieved ${retrieved.length} chunk(s).`);
            workspaceInfo = {
              status: "ok",
              indexedChunks,
              retrieved: retrieved.length,
              hits: retrieved.map((s) => `${s.path}:${s.startLine}-${s.endLine}`),
            };
          } else {
            outputChannel.appendLine("[index] @workspace produced no results.");
            workspaceInfo = { status: "empty", indexedChunks, retrieved: 0 };
            void vscode.window.showWarningMessage(
              "CodeSetu @workspace found no matches. The index may be empty — run 'CodeSetu: Index Workspace' and check Output → CodeSetu.",
            );
          }
        } catch (error) {
          const message = formatErrorMessage(error);
          outputChannel.appendLine(`[index] @workspace failed: ${message}`);
          workspaceInfo = { status: "error", message };
          void vscode.window.showErrorMessage(
            `CodeSetu @workspace failed: ${message}. Check the embeddings endpoint (codesetu.workspaceIndex.embeddingBaseUrl/Model).`,
          );
        }
      }
    }
    const instructions = await loadInstructions();

    // Surface exactly what we're about to send — provider, agent mode, @workspace
    // retrieval, selected code, routed skills, and the full assembled payload —
    // for the chat's "Context & activity" panel.
    requestContext?.onContextPreview?.(
      buildContextPreview(ideContext, routed.selected, instructions, builtinSkills, {
        provider: providerSummaryForPreview(),
        agentMode: requestContext?.agentMode === true,
        ...(workspaceInfo === undefined ? {} : { workspace: workspaceInfo }),
      }),
    );

    // Estimate how much context this turn carries (system prompt + IDE context +
    // the rolling history) for the composer's usage gauge.
    requestContext?.onUsage?.({
      tokens: estimateTokensForParts([
        buildCodeSetuSystemMessage([...instructions], { pinnedSkills: [...routed.selected] }),
        hasIdeContext(ideContext) ? buildContextMarkdown(ideContext) : "",
        ...providerMessages.map((message) =>
          typeof message.content === "string" ? message.content : "",
        ),
      ]),
    });

    outputChannel.appendLine(`Chat request — agentMode=${requestContext?.agentMode === true}`);
    if (requestContext?.agentMode === true) {
      // Give the agent the semantic-search tool when an index exists, so it can
      // retrieve by meaning instead of only grep/glob.
      const searchTool = await workspaceIndex.searchTool();
      return sendAgentChatRequest(
        providerMessages,
        buildProviderOptions(),
        statusBarItem,
        outputChannel,
        instructions,
        ideContext,
        requestContext?.onChunk,
        routed.selected,
        requestContext?.persistMessages,
        requestContext?.signal,
        requestContext?.requestApproval,
        (checkpoint) => {
          lastAgentCheckpoint = checkpoint;
        },
        searchTool === undefined ? [] : [searchTool],
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
  const newChatCommand = vscode.commands.registerCommand("codesetu.newChat", () => {
    ChatPanel.createOrShow(context.extensionUri, responder, outputChannel, buildSpeechBridge());
    ChatPanel.newConversation();
  });
  const chatHistoryCommand = vscode.commands.registerCommand("codesetu.chatHistory", () => {
    ChatPanel.createOrShow(context.extensionUri, responder, outputChannel, buildSpeechBridge());
    ChatPanel.showHistory();
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
  const revertAgentEditsCommand = vscode.commands.registerCommand(
    "codesetu.revertLastAgentEdits",
    async () => {
      if (lastAgentCheckpoint === undefined || lastAgentCheckpoint.isEmpty()) {
        void vscode.window.showInformationMessage("CodeSetu: no agent edits to revert.");
        return;
      }
      const files = lastAgentCheckpoint.changedFiles();
      const confirm = await vscode.window.showWarningMessage(
        `Revert the last CodeSetu agent turn? This restores ${files.length} file${files.length === 1 ? "" : "s"} to their pre-turn state.`,
        { modal: true, detail: files.join("\n") },
        "Revert",
      );
      if (confirm !== "Revert") {
        return;
      }
      const result = await lastAgentCheckpoint.revert();
      lastAgentCheckpoint = undefined;
      outputChannel.appendLine(
        `[agent] reverted — restored=${result.restored}, deleted=${result.deleted}, failed=${result.failed}`,
      );
      const summary =
        `CodeSetu reverted ${result.restored} file${result.restored === 1 ? "" : "s"}` +
        (result.deleted > 0
          ? `, deleted ${result.deleted} new file${result.deleted === 1 ? "" : "s"}`
          : "") +
        (result.failed > 0 ? `, ${result.failed} failed` : "") +
        ".";
      void vscode.window.showInformationMessage(summary);
    },
  );

  const indexWorkspaceCommand = vscode.commands.registerCommand("codesetu.indexWorkspace", () =>
    vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "CodeSetu: indexing workspace…" },
      async (progress) => {
        try {
          const summary = await workspaceIndex.reindex((done, total) => {
            progress.report({ message: `embedding ${done}/${total} chunks` });
          });
          void vscode.window.showInformationMessage(`CodeSetu: ${summary}`);
        } catch (error: unknown) {
          const message = formatErrorMessage(error);
          outputChannel.appendLine(`[index] failed: ${message}`);
          void vscode.window.showErrorMessage(`CodeSetu indexing failed: ${message}`);
        }
      },
    ),
  );

  const editorActions = registerCodeSetuEditorActions({
    context,
    responder,
    outputChannel,
    speechBridge: buildSpeechBridge,
  });

  const editCommand = registerEditCommand({
    createProvider: () => createProvider(buildProviderOptions()),
    getConfiguration: readCodeSetuConfiguration,
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
    newChatCommand,
    chatHistoryCommand,
    setupProviderCommand,
    setupSpeechProviderCommand,
    diagnoseProviderCommand,
    selectModelCommand,
    revertAgentEditsCommand,
    indexWorkspaceCommand,
    ...editorActions,
    ...editCommand,
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
      // Sanitize in case persisted history from a prior agent turn was trimmed
      // and split a tool-call/result pair, which the provider would reject.
      messages: sanitizeToolMessages([
        {
          role: "system",
          content: buildCodeSetuSystemMessage([...instructions], {
            pinnedSkills: [...pinnedSkills],
          }),
        },
        ...contextualMessages,
      ]),
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
  persistMessages?: (messages: ChatMessage[]) => void,
  signal?: AbortSignal,
  requestApproval?: (request: ApprovalRequest) => Promise<ApprovalDecision>,
  onCheckpoint?: (checkpoint: WorkspaceCheckpoint) => void,
  extraTools: AgentTool[] = [],
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
      messages: sanitizeToolMessages([
        { role: "system", content: systemContent },
        ...contextualMessages,
      ]),
      maxTokens: configuration.chatMaxTokens,
      temperature: configuration.chatTemperature,
      workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      ...(extraTools.length === 0 ? {} : { extraTools }),
      ...(onChunk === undefined ? {} : { onChunk }),
      ...(persistMessages === undefined ? {} : { onPersist: persistMessages }),
      ...(signal === undefined ? {} : { signal }),
      ...(requestApproval === undefined ? {} : { requestApproval }),
      ...(onCheckpoint === undefined ? {} : { onCheckpoint }),
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
    (context.relatedSnippets !== undefined && context.relatedSnippets.length > 0) ||
    (context.pinnedFiles !== undefined && context.pinnedFiles.length > 0)
  );
}

/**
 * Assemble the "Context sent to AI" preview from the same pieces the request is
 * built from — so the panel shows exactly what the model receives: routed
 * skills (with their slash), the IDE context summary (selection, file,
 * snippets), and the full system prompt + context markdown for deep inspection.
 */
interface ContextPreviewExtras {
  provider?: ContextPreview["provider"];
  agentMode?: boolean;
  workspace?: ContextPreview["workspace"];
}

function buildContextPreview(
  ideContext: IdeContextPayload,
  selectedSkills: readonly WorkspaceInstruction[],
  instructions: readonly WorkspaceInstruction[],
  builtinSkills: readonly { id: string; slashCommands: readonly string[] }[],
  extras: ContextPreviewExtras = {},
): ContextPreview {
  const selection = ideContext.selectedText;
  return {
    skills: selectedSkills.map((skill) => {
      const slash = builtinSkills.find((b) => b.id === skill.id)?.slashCommands[0];
      return { name: skill.name, ...(slash === undefined ? {} : { slash }) };
    }),
    ...(extras.provider === undefined ? {} : { provider: extras.provider }),
    ...(extras.agentMode === undefined ? {} : { agentMode: extras.agentMode }),
    ...(extras.workspace === undefined ? {} : { workspace: extras.workspace }),
    ideContext: {
      ...(ideContext.activeFilePath === undefined
        ? {}
        : { activeFilePath: ideContext.activeFilePath }),
      ...(ideContext.languageId === undefined ? {} : { languageId: ideContext.languageId }),
      hasSelection: selection !== undefined && selection.length > 0,
      ...(selection === undefined ? {} : { selectedText: selection }),
      snippetCount: ideContext.relatedSnippets?.length ?? 0,
      pinnedCount: ideContext.pinnedFiles?.length ?? 0,
      retrievedCount: ideContext.retrievedSnippets?.length ?? 0,
    },
    full: {
      systemPrompt: buildCodeSetuSystemMessage([...instructions], {
        pinnedSkills: [...selectedSkills],
      }),
      contextMarkdown: hasIdeContext(ideContext) ? buildContextMarkdown(ideContext) : "",
    },
  };
}

/** Provider / model / endpoint shown in the activity panel (no secrets). */
function providerSummaryForPreview(): ContextPreview["provider"] {
  const summary = summarizeCodeSetuConfiguration();
  return {
    provider: summary.provider,
    ...(summary.model === undefined ? {} : { model: summary.model }),
    ...(summary.baseURL === undefined ? {} : { baseURL: summary.baseURL }),
  };
}
