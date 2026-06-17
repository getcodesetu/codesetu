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

import crypto from "node:crypto";

import {
  BUILTIN_SKILLS_FALLBACK,
  type ApprovalDecision,
  type ApprovalRequest,
  type AudioBlob,
  type BuiltinSkill,
  type ChatMessage,
  type ChatStreamChunk,
  type IdeContextPayload,
} from "@codesetu/core";
import * as vscode from "vscode";

import { renderChatPanelHtml } from "./chatPanelHtml";
import { summarizeCodeSetuConfiguration } from "./configuration";
import { getActiveOrLastEditor } from "./ideContext";
import { searchWorkspaceFiles } from "./pinnedFiles";
import { DictationController, NoRecorderError } from "./dictation";
import { readSpeechConfiguration } from "./speechConfiguration";

// Cap the rolling transcript sent to the provider so long sessions don't
// overflow the context window. The most recent turns are always kept.
const MAX_HISTORY_CHARS = 100_000;

/** Preview of what the responder is about to send to the model, for the
 *  collapsible "Context sent to AI" panel. */
export interface ContextPreview {
  skills: { name: string; slash?: string }[];
  ideContext: {
    activeFilePath?: string;
    languageId?: string;
    hasSelection: boolean;
    selectedText?: string;
    snippetCount: number;
  };
  full: { systemPrompt: string; contextMarkdown: string };
}

export interface ChatResponderContext {
  ideContext?: IdeContextPayload;
  includeIdeContext?: boolean;
  planMode?: boolean;
  /** When true, drive the tool-calling agent loop instead of a single reply. */
  agentMode?: boolean;
  /** Workspace-relative paths the user @-pinned in the composer for this turn. */
  pinnedFiles?: string[];
  /** Aborts when the user hits Stop; the agent loop checks it between steps. */
  signal?: AbortSignal;
  /** Approve a mutating tool call inline in the chat (replaces the native modal). */
  requestApproval?: (request: ApprovalRequest) => Promise<ApprovalDecision>;
  onChunk?: (chunk: ChatStreamChunk) => void;
  /** Called once the payload is assembled, before the reply streams. */
  onContextPreview?: (preview: ContextPreview) => void;
  /**
   * Agent mode: the messages the turn produced (assistant tool-call turns, tool
   * results, final answer) to append to history verbatim, so the next turn keeps
   * the agent's tool context. When called, the caller persists these instead of
   * the returned answer string.
   */
  persistMessages?: (messages: ChatMessage[]) => void;
}

export interface SendUserMessageOptions {
  ideContext?: IdeContextPayload;
  includeIdeContext?: boolean;
  planMode?: boolean;
  agentMode?: boolean;
  pinnedFiles?: string[];
}

export type ChatResponder = (
  messages: ChatMessage[],
  context?: ChatResponderContext,
) => Promise<string>;

/** Host-side speech bridge invoked by the webview mic control. */
export interface SpeechBridge {
  transcribe(audio: AudioBlob, language: string): Promise<{ text: string; language?: string }>;
}

interface SendMessageRequest {
  type: "sendMessage";
  text: string;
  includeIdeContext?: boolean;
  planMode?: boolean;
  agentMode?: boolean;
  pinnedFiles?: string[];
}

interface SearchFilesRequest {
  type: "searchFiles";
  requestId: string;
  query: string;
}

interface TranscribeRequest {
  type: "transcribe";
  requestId: string;
  mimeType: string;
  base64: string;
}

interface UiStateRequest {
  type: "uiState";
  planMode?: boolean;
  agentMode?: boolean;
}

interface PermissionDeniedRequest {
  type: "permissionDenied";
  reason: "denied" | "no-device" | "in-use" | "network" | "unsupported" | "other";
  message?: string;
}

interface DictationRequest {
  type: "dictation";
  action: "start" | "stop";
}

interface InsertCodeRequest {
  type: "insertCode";
  code: string;
}

interface CopyCodeRequest {
  type: "copyCode";
  code: string;
}

export class ChatPanel {
  private static currentPanel: ChatPanel | undefined;
  // Built-in skills resolved at activation (loaded from bundled SKILL.md, or the
  // fallback constants). Set once via configureBuiltinSkills; used to build the
  // slash-command palette. Defaults to the fallback so the palette is never empty.
  private static builtinSkills: readonly BuiltinSkill[] = BUILTIN_SKILLS_FALLBACK;

  /** Set the built-in skills used for the slash palette (call once at activation). */
  public static configureBuiltinSkills(skills: readonly BuiltinSkill[]): void {
    ChatPanel.builtinSkills = skills;
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly history: ChatMessage[] = [];
  private inFlight = false;
  // Webview-owned UI state mirrored to the host so editor actions (which don't
  // go through the composer) can inherit the user's current Plan Mode pick.
  private currentPlanMode = false;
  // Likewise mirror Agent Mode so editor-action submissions inherit the pick.
  private currentAgentMode = false;
  // Aborts the in-flight turn when the user hits Stop.
  private inFlightController: AbortController | undefined;
  // Pending inline tool approvals, keyed by request id, awaiting a webview click.
  private readonly pendingApprovals = new Map<string, (decision: ApprovalDecision) => void>();
  // Host-side mic capture for dictation (the webview can't reach the mic).
  private readonly dictation: DictationController;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly responder: ChatResponder,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly speechBridge: SpeechBridge | undefined,
  ) {
    this.panel = panel;
    this.dictation = new DictationController(speechBridge, {
      onState: (state) => this.postWebview({ type: "dictationState", state }),
      onResult: (text) => this.postWebview({ type: "dictationResult", text }),
      onError: (message) => this.postWebview({ type: "dictationError", message }),
      log: (line) => this.outputChannel.appendLine(line),
    });
    this.panel.webview.html = this.renderHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });
    this.panel.onDidDispose(() => {
      this.resolvePendingApprovals("deny");
      this.dictation.dispose();
      ChatPanel.currentPanel = undefined;
    });
  }

  private postWebview(message: Record<string, unknown>): void {
    void this.panel.webview.postMessage(message);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    responder: ChatResponder,
    outputChannel: vscode.OutputChannel,
    speechBridge?: SpeechBridge,
  ): void {
    if (ChatPanel.currentPanel !== undefined) {
      ChatPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "codesetuChat",
      "CodeSetu",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
        retainContextWhenHidden: true,
      },
    );

    ChatPanel.currentPanel = new ChatPanel(panel, responder, outputChannel, speechBridge);
  }

  public static async createOrShowAndSend(
    extensionUri: vscode.Uri,
    responder: ChatResponder,
    outputChannel: vscode.OutputChannel,
    text: string,
    options: SendUserMessageOptions = {},
    speechBridge?: SpeechBridge,
  ): Promise<void> {
    ChatPanel.createOrShow(extensionUri, responder, outputChannel, speechBridge);
    await ChatPanel.currentPanel?.sendUserMessage(text, options);
  }

  public async sendUserMessage(text: string, options: SendUserMessageOptions = {}): Promise<void> {
    await this.submitMessage(text, options);
  }

  public static refreshModelLabel(): void {
    ChatPanel.currentPanel?.postModelLabel();
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (isSelectModelRequest(message)) {
      // The command updates codesetu.model and calls refreshModelLabel(), which
      // posts the new label back to this webview.
      await vscode.commands.executeCommand("codesetu.selectModel");
      return;
    }

    if (isTranscribeRequest(message)) {
      await this.handleTranscribe(message);
      return;
    }

    if (isUiStateRequest(message)) {
      if (typeof message.planMode === "boolean") {
        this.currentPlanMode = message.planMode;
      }
      if (typeof message.agentMode === "boolean") {
        this.currentAgentMode = message.agentMode;
      }
      return;
    }

    if (isCancelRequest(message)) {
      this.inFlightController?.abort();
      this.resolvePendingApprovals("deny");
      return;
    }

    if (isToolApprovalResponse(message)) {
      const resolve = this.pendingApprovals.get(message.id);
      if (resolve !== undefined) {
        this.pendingApprovals.delete(message.id);
        resolve(message.decision);
      }
      return;
    }

    if (isPermissionDeniedRequest(message)) {
      void this.handlePermissionDenied(message);
      return;
    }

    if (isDictationRequest(message)) {
      await this.handleDictation(message);
      return;
    }

    if (isSearchFilesRequest(message)) {
      const files = await searchWorkspaceFiles(vscode, message.query);
      this.postWebview({ type: "fileResults", requestId: message.requestId, items: files });
      return;
    }

    if (isInsertCodeRequest(message)) {
      await this.insertCodeIntoEditor(message.code);
      return;
    }

    if (isCopyCodeRequest(message)) {
      await vscode.env.clipboard.writeText(message.code);
      return;
    }

    if (!isSendMessageRequest(message) || this.inFlight) {
      return;
    }

    await this.submitMessage(message.text, {
      includeIdeContext: message.includeIdeContext,
      planMode: message.planMode,
      agentMode: message.agentMode,
      ...(message.pinnedFiles === undefined ? {} : { pinnedFiles: message.pinnedFiles }),
    });
  }

  private async handleTranscribe(message: TranscribeRequest): Promise<void> {
    if (this.speechBridge === undefined) {
      this.postSpeechError(
        message.requestId,
        "Configure a non-browser speech provider via CodeSetu: Setup Speech Provider.",
      );
      return;
    }
    try {
      const audio = { mimeType: message.mimeType, bytes: decodeBase64(message.base64) };
      const language = readSpeechConfiguration().language;
      const result = await this.speechBridge.transcribe(audio, language);
      void this.panel.webview.postMessage({
        type: "transcription",
        requestId: message.requestId,
        text: result.text,
        ...(result.language === undefined ? {} : { language: result.language }),
      });
    } catch (error: unknown) {
      this.outputChannel.appendLine(`Transcription failed: ${formatErrorMessage(error)}`);
      this.postSpeechError(message.requestId, formatErrorMessage(error));
    }
  }

  /**
   * Drive host-side dictation. Capture runs in the extension host (a recorder
   * CLI) and the resulting WAV is transcribed by the configured server STT
   * provider — the webview only toggles start/stop and renders state.
   */
  private async handleDictation(message: DictationRequest): Promise<void> {
    if (message.action === "stop") {
      await this.dictation.stop(readSpeechConfiguration().language);
      return;
    }
    try {
      await this.dictation.start();
    } catch (error: unknown) {
      if (error instanceof NoRecorderError) {
        // Missing recorder is a setup problem, not a transient error — make it
        // discoverable with a modal rather than a tiny inline status line.
        const choice = await vscode.window.showWarningMessage(
          "Dictation needs a recorder",
          { modal: true, detail: error.message },
          "Open Install Docs",
        );
        if (choice === "Open Install Docs") {
          await vscode.env.openExternal(vscode.Uri.parse("https://sox.sourceforge.net/"));
        }
        this.postWebview({ type: "dictationState", state: "idle" });
        return;
      }
      this.outputChannel.appendLine(`Dictation start failed: ${formatErrorMessage(error)}`);
      this.postWebview({ type: "dictationError", message: formatErrorMessage(error) });
      this.postWebview({ type: "dictationState", state: "idle" });
    }
  }

  /**
   * Insert a chat code block into the editor the user was last in (the webview
   * holds focus, so window.activeTextEditor is undefined — we use the tracked
   * last editor). Replaces the current selection if there is one; otherwise
   * inserts at the cursor. Focuses the editor so the change is visible.
   */
  private async insertCodeIntoEditor(code: string): Promise<void> {
    const editor = getActiveOrLastEditor(vscode);
    if (editor === undefined) {
      void vscode.window.showWarningMessage(
        "CodeSetu: open a file and place your cursor where the code should go, then try again.",
      );
      return;
    }
    const target = editor.selection;
    const shown = await vscode.window.showTextDocument(editor.document, {
      viewColumn: editor.viewColumn ?? vscode.ViewColumn.One,
      preserveFocus: false,
    });
    const applied = await shown.edit((builder) => {
      builder.replace(target, code);
    });
    if (!applied) {
      void vscode.window.showWarningMessage("CodeSetu could not insert the code into the editor.");
    }
  }

  // NOTE: VS Code dictation now captures in the extension host (see
  // dictation.ts), not the webview, so the webview never calls getUserMedia and
  // never posts "permissionDenied". This handler is therefore unreachable in
  // VS Code today; it's kept for the JetBrains-style webview flow and for
  // if/when VS Code grants webview mic access (microsoft/vscode#250568).
  private async handlePermissionDenied(message: PermissionDeniedRequest): Promise<void> {
    const platform = process.platform;
    const guide = buildMicPermissionGuide(platform, message.reason);
    const detail =
      (message.message !== undefined && message.message.length > 0
        ? `${message.message}\n\n`
        : "") + guide.detail;
    const settingsButton = guide.settingsUrl !== undefined ? "Open Mic Settings" : undefined;
    // A modal dialog always gets a built-in "Cancel" button, so we don't add
    // our own "Dismiss" — that would show two redundant close buttons.
    const actions = [
      ...(settingsButton !== undefined ? [settingsButton] : []),
      "Switch Speech Provider",
    ];
    const choice = await vscode.window.showWarningMessage(
      guide.title,
      { modal: true, detail },
      ...actions,
    );
    if (choice === settingsButton && guide.settingsUrl !== undefined) {
      await vscode.env.openExternal(vscode.Uri.parse(guide.settingsUrl));
    } else if (choice === "Switch Speech Provider") {
      await vscode.commands.executeCommand("codesetu.setupSpeechProvider");
    }
  }

  private postSpeechError(requestId: string, errorText: string): void {
    void this.panel.webview.postMessage({
      type: "speechError",
      requestId,
      text: errorText,
    });
  }

  private postModelLabel(): void {
    const summary = summarizeCodeSetuConfiguration();
    void this.panel.webview.postMessage({
      type: "modelLabel",
      text: `${summary.provider} · ${summary.model ?? "default"}`,
    });
  }

  /** Ask the user to approve a mutating tool call via an inline card in the chat. */
  private requestToolApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    const id = crypto.randomUUID();
    return new Promise<ApprovalDecision>((resolve) => {
      this.pendingApprovals.set(id, resolve);
      void this.panel.webview.postMessage({
        type: "toolApproval",
        id,
        tool: request.tool.name,
        detail: approvalDetail(request),
      });
    });
  }

  /** Settle any awaiting approvals (e.g. on Stop or panel close) so the loop unblocks. */
  private resolvePendingApprovals(decision: ApprovalDecision): void {
    for (const resolve of this.pendingApprovals.values()) {
      resolve(decision);
    }
    this.pendingApprovals.clear();
  }

  private async submitMessage(
    rawText: string,
    options: SendUserMessageOptions = {},
  ): Promise<void> {
    if (this.inFlight) {
      return;
    }

    const text = rawText.trim();

    if (text.length === 0) {
      return;
    }

    this.inFlight = true;
    const controller = new AbortController();
    this.inFlightController = controller;
    void this.panel.webview.postMessage({ type: "busy", value: true });
    void this.panel.webview.postMessage({ type: "userMessage", text });
    this.history.push({ role: "user", content: text });
    this.trimHistory();

    try {
      let isStreamingAssistantMessage = false;
      const ensureStarted = (): void => {
        if (!isStreamingAssistantMessage) {
          isStreamingAssistantMessage = true;
          void this.panel.webview.postMessage({ type: "assistantMessageStart" });
        }
      };
      let persistedMessages: ChatMessage[] | undefined;
      const response = await this.responder(this.history, {
        includeIdeContext: options.includeIdeContext ?? true,
        planMode: options.planMode ?? this.currentPlanMode,
        agentMode: options.agentMode ?? this.currentAgentMode,
        signal: controller.signal,
        requestApproval: (request) => this.requestToolApproval(request),
        ...(options.pinnedFiles === undefined ? {} : { pinnedFiles: options.pinnedFiles }),
        ...(options.ideContext === undefined ? {} : { ideContext: options.ideContext }),
        persistMessages: (messages) => {
          persistedMessages = messages;
        },
        onContextPreview: (preview) => {
          void this.panel.webview.postMessage({ type: "contextPreview", preview });
        },
        onChunk: (chunk) => {
          ensureStarted();
          if (chunk.reasoning !== undefined) {
            void this.panel.webview.postMessage({
              type: "assistantReasoningDelta",
              text: chunk.reasoning,
            });
          }
          if (chunk.content !== undefined) {
            void this.panel.webview.postMessage({
              type: "assistantMessageDelta",
              text: chunk.content,
            });
          }
        },
      });
      // Agent turns persist their full tool transcript (assistant tool-call
      // turns + tool results + final answer) so the next turn keeps that
      // context; plain chat persists just the assistant reply.
      if (persistedMessages !== undefined) {
        this.history.push(...persistedMessages);
      } else {
        this.history.push({ role: "assistant", content: response });
      }
      void this.panel.webview.postMessage(
        isStreamingAssistantMessage
          ? { type: "assistantMessageDone" }
          : { type: "assistantMessage", text: response },
      );
    } catch (error: unknown) {
      // Drop the optimistic user turn so a retry doesn't stack two user
      // messages with no assistant reply between them.
      if (this.history[this.history.length - 1]?.role === "user") {
        this.history.pop();
      }
      this.outputChannel.appendLine(`Chat request failed: ${formatErrorMessage(error)}`);
      void this.panel.webview.postMessage({
        type: "error",
        text: `CodeSetu could not complete that request: ${formatErrorMessage(error)}`,
      });
    } finally {
      this.inFlight = false;
      this.inFlightController = undefined;
      void this.panel.webview.postMessage({ type: "busy", value: false });
    }
  }

  private trimHistory(): void {
    let total = this.history.reduce((sum, message) => sum + messageLength(message), 0);

    while (this.history.length > 1 && total > MAX_HISTORY_CHARS) {
      const removed = this.history.shift();

      if (removed === undefined) {
        break;
      }

      total -= messageLength(removed);
    }
  }

  private renderHtml(webview: vscode.Webview): string {
    const summary = summarizeCodeSetuConfiguration();
    const speech = readSpeechConfiguration();

    return renderChatPanelHtml({
      cspSource: webview.cspSource,
      nonce: crypto.randomUUID(),
      modelLabel: `${summary.provider} · ${summary.model ?? "default"}`,
      slashCommands: ChatPanel.builtinSkills.flatMap((skill) =>
        skill.slashCommands.map((command) => ({
          command,
          skillName: skill.name,
          description: skill.description,
        })),
      ),
      speechConnectSources: speechConnectSources(speech),
      speechSttProvider: speech.sttProvider,
      speechLanguage: speech.language,
    });
  }
}

/**
 * Build a CSP `connect-src` allowlist from the configured speech endpoint.
 * Returns the bare origin (https://api.sarvam.ai). The webview already has
 * 'self' in its connect-src, so we only add explicit external origins here.
 */
function speechConnectSources(speech: ReturnType<typeof readSpeechConfiguration>): string[] {
  const origins = new Set<string>();
  if (speech.sttBaseUrl.length > 0) {
    try {
      origins.add(new URL(speech.sttBaseUrl).origin);
    } catch {
      // Ignore malformed URLs — they would fail at fetch time anyway.
    }
  }
  if (speech.sttProvider === "sarvam") {
    origins.add("https://api.sarvam.ai");
  }
  if (speech.sttProvider === "huggingface") {
    origins.add("https://router.huggingface.co");
    origins.add("https://api-inference.huggingface.co");
  }
  return [...origins];
}

function messageLength(message: ChatMessage): number {
  return typeof message.content === "string" ? message.content.length : 0;
}

function isSelectModelRequest(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "selectModel"
  );
}

function isTranscribeRequest(message: unknown): message is TranscribeRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<TranscribeRequest>;
  return (
    candidate.type === "transcribe" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.base64 === "string"
  );
}

function decodeBase64(value: string): Uint8Array {
  const buffer = Buffer.from(value, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function isUiStateRequest(message: unknown): message is UiStateRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<UiStateRequest>;
  return (
    candidate.type === "uiState" &&
    (candidate.planMode === undefined || typeof candidate.planMode === "boolean") &&
    (candidate.agentMode === undefined || typeof candidate.agentMode === "boolean")
  );
}

function isDictationRequest(message: unknown): message is DictationRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<DictationRequest>;
  return (
    candidate.type === "dictation" && (candidate.action === "start" || candidate.action === "stop")
  );
}

function isSearchFilesRequest(message: unknown): message is SearchFilesRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<SearchFilesRequest>;
  return (
    candidate.type === "searchFiles" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.query === "string"
  );
}

function isInsertCodeRequest(message: unknown): message is InsertCodeRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<InsertCodeRequest>;
  return candidate.type === "insertCode" && typeof candidate.code === "string";
}

function isCopyCodeRequest(message: unknown): message is CopyCodeRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<CopyCodeRequest>;
  return candidate.type === "copyCode" && typeof candidate.code === "string";
}

function isCancelRequest(message: unknown): boolean {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "cancel"
  );
}

interface ToolApprovalResponse {
  type: "toolApprovalResponse";
  id: string;
  decision: ApprovalDecision;
}

function isToolApprovalResponse(message: unknown): message is ToolApprovalResponse {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as Partial<ToolApprovalResponse>;
  return (
    candidate.type === "toolApprovalResponse" &&
    typeof candidate.id === "string" &&
    (candidate.decision === "approve" ||
      candidate.decision === "approve_always" ||
      candidate.decision === "deny")
  );
}

/** Build the detail shown in the inline approval card. */
function approvalDetail(request: ApprovalRequest): string {
  if (request.preview !== undefined && request.preview.length > 0) {
    return request.preview;
  }
  const command = typeof request.args.command === "string" ? request.args.command : undefined;
  if (request.tool.name === "bash" && command !== undefined) {
    return `Run: ${command}`;
  }
  return request.rawArguments;
}

function isPermissionDeniedRequest(message: unknown): message is PermissionDeniedRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<PermissionDeniedRequest>;
  return candidate.type === "permissionDenied" && typeof candidate.reason === "string";
}

interface MicPermissionGuide {
  title: string;
  detail: string;
  /** OS-specific deep-link to the right Settings pane, when one exists. */
  settingsUrl?: string;
}

/**
 * Build the OS-specific instructions shown to the user when getUserMedia
 * fails. Settings deep-links are well-known custom URI schemes that
 * vscode.env.openExternal handles natively (x-apple.systempreferences on
 * macOS, ms-settings on Windows).
 */
function buildMicPermissionGuide(
  platform: NodeJS.Platform,
  reason: PermissionDeniedRequest["reason"],
): MicPermissionGuide {
  if (reason === "no-device") {
    return {
      title: "No microphone detected",
      detail:
        "Plug in a microphone (or check that one is selected as the system input device) and try again.",
    };
  }
  if (reason === "in-use") {
    return {
      title: "Microphone is in use by another app",
      detail: "Close any video-conferencing or recording app holding the mic and try again.",
    };
  }
  if (reason === "network") {
    return {
      title: "Browser speech recognition needs network access",
      detail:
        "Chromium's WebSpeech relies on Google's online recognition service. Either reconnect, or switch to a server STT provider (Sarvam / OpenAI-compatible / Hugging Face) via CodeSetu: Setup Speech Provider.",
    };
  }
  if (reason === "unsupported") {
    return {
      title: "Mic capture is unavailable in this webview",
      detail:
        "Your VSCode build may be missing the media-stream subsystem. Update VSCode and retry; if it persists, please report the issue.",
    };
  }

  // "denied" or "other" — give OS-specific steps and the deep link.
  if (platform === "darwin") {
    return {
      title: "Microphone access blocked",
      detail:
        "macOS is blocking the mic for the editor that's running CodeSetu.\n\n" +
        "Open System Settings → Privacy & Security → Microphone, then enable the row for Visual Studio Code (or Code – Insiders / VSCodium, whichever you launched).\n\n" +
        "You may need to quit and reopen VSCode after granting access.",
      settingsUrl: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    };
  }
  if (platform === "win32") {
    return {
      title: "Microphone access blocked",
      detail:
        "Windows is blocking the mic for the editor that's running CodeSetu.\n\n" +
        "Open Settings → Privacy & Security → Microphone, turn on 'Microphone access' and 'Let desktop apps access your microphone', then return to VSCode.",
      settingsUrl: "ms-settings:privacy-microphone",
    };
  }
  // Linux: no standard deep-link. Instructions vary by distro / audio server.
  return {
    title: "Microphone access blocked",
    detail:
      "Linux mic permissions depend on your audio server (PipeWire, PulseAudio) and on whether VSCode is sandboxed (Flatpak, Snap).\n\n" +
      " • PulseAudio: run `pavucontrol` and check the Recording tab for VSCode.\n" +
      " • PipeWire: `wpctl status` to confirm the input source is unmuted.\n" +
      " • Flatpak VSCode: `flatpak override --user --device=all com.visualstudio.code` then restart VSCode.",
  };
}

function isSendMessageRequest(message: unknown): message is SendMessageRequest {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as Partial<SendMessageRequest>;
  return (
    candidate.type === "sendMessage" &&
    typeof candidate.text === "string" &&
    (candidate.includeIdeContext === undefined ||
      typeof candidate.includeIdeContext === "boolean") &&
    (candidate.planMode === undefined || typeof candidate.planMode === "boolean") &&
    (candidate.agentMode === undefined || typeof candidate.agentMode === "boolean") &&
    (candidate.pinnedFiles === undefined ||
      (Array.isArray(candidate.pinnedFiles) &&
        candidate.pinnedFiles.every((entry) => typeof entry === "string")))
  );
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
