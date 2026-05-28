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
  BUILTIN_SKILLS,
  type AudioBlob,
  type ChatMessage,
  type IdeContextPayload,
} from "@codesetu/core";
import * as vscode from "vscode";

import { renderChatPanelHtml } from "./chatPanelHtml";
import { summarizeCodeSetuConfiguration } from "./configuration";
import { readSpeechConfiguration } from "./speechConfiguration";

// Cap the rolling transcript sent to the provider so long sessions don't
// overflow the context window. The most recent turns are always kept.
const MAX_HISTORY_CHARS = 100_000;

export interface ChatResponderContext {
  ideContext?: IdeContextPayload;
  includeIdeContext?: boolean;
  planMode?: boolean;
  onChunk?: (chunk: string) => void;
}

export interface SendUserMessageOptions {
  ideContext?: IdeContextPayload;
  includeIdeContext?: boolean;
  planMode?: boolean;
}

export type ChatResponder = (
  messages: ChatMessage[],
  context?: ChatResponderContext,
) => Promise<string>;

/** Host-side speech bridge invoked by webview mic / TTS controls. */
export interface SpeechBridge {
  transcribe(audio: AudioBlob, language: string): Promise<{ text: string; language?: string }>;
  synthesize(text: string, language: string): Promise<AudioBlob>;
}

interface SendMessageRequest {
  type: "sendMessage";
  text: string;
  includeIdeContext?: boolean;
  planMode?: boolean;
}

interface TranscribeRequest {
  type: "transcribe";
  requestId: string;
  mimeType: string;
  base64: string;
}

interface SynthesizeRequest {
  type: "synthesize";
  requestId: string;
  text: string;
}

export class ChatPanel {
  private static currentPanel: ChatPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly history: ChatMessage[] = [];
  private inFlight = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly responder: ChatResponder,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly speechBridge: SpeechBridge | undefined,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.renderHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });
    this.panel.onDidDispose(() => {
      ChatPanel.currentPanel = undefined;
    });
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

    if (isSynthesizeRequest(message)) {
      await this.handleSynthesize(message);
      return;
    }

    if (!isSendMessageRequest(message) || this.inFlight) {
      return;
    }

    await this.submitMessage(message.text, {
      includeIdeContext: message.includeIdeContext,
      planMode: message.planMode,
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

  private async handleSynthesize(message: SynthesizeRequest): Promise<void> {
    if (this.speechBridge === undefined) {
      this.postSpeechError(
        message.requestId,
        "Configure a non-browser speech provider via CodeSetu: Setup Speech Provider.",
      );
      return;
    }
    try {
      const language = readSpeechConfiguration().language;
      const audio = await this.speechBridge.synthesize(message.text, language);
      void this.panel.webview.postMessage({
        type: "synthesized",
        requestId: message.requestId,
        mimeType: audio.mimeType,
        base64: encodeBase64(audio.bytes),
      });
    } catch (error: unknown) {
      this.outputChannel.appendLine(`TTS failed: ${formatErrorMessage(error)}`);
      this.postSpeechError(message.requestId, formatErrorMessage(error));
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
    void this.panel.webview.postMessage({ type: "busy", value: true });
    void this.panel.webview.postMessage({ type: "userMessage", text });
    this.history.push({ role: "user", content: text });
    this.trimHistory();

    try {
      let isStreamingAssistantMessage = false;
      const response = await this.responder(this.history, {
        includeIdeContext: options.includeIdeContext ?? true,
        planMode: options.planMode ?? false,
        ...(options.ideContext === undefined ? {} : { ideContext: options.ideContext }),
        onChunk: (chunk) => {
          if (!isStreamingAssistantMessage) {
            isStreamingAssistantMessage = true;
            void this.panel.webview.postMessage({ type: "assistantMessageStart" });
          }

          void this.panel.webview.postMessage({ type: "assistantMessageDelta", text: chunk });
        },
      });
      this.history.push({ role: "assistant", content: response });
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
        text: "CodeSetu could not complete that request. Check your provider settings and API key.",
      });
    } finally {
      this.inFlight = false;
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
      slashCommands: BUILTIN_SKILLS.flatMap((skill) =>
        skill.slashCommands.map((command) => ({
          command,
          skillName: skill.name,
          description: skill.description,
        })),
      ),
      speechConnectSources: speechConnectSources(speech),
      speechSttProvider: speech.sttProvider,
      speechTtsProvider: speech.ttsProvider,
      speechLanguage: speech.language,
      speechTtsEnabled: speech.ttsEnabled,
    });
  }
}

/**
 * Build a CSP `connect-src` allowlist from the configured speech endpoints.
 * Returns the bare origins (https://api.sarvam.ai). The webview already has
 * 'self' in its connect-src, so we only add explicit external origins here.
 */
function speechConnectSources(speech: ReturnType<typeof readSpeechConfiguration>): string[] {
  const origins = new Set<string>();
  const consider = (value: string | undefined): void => {
    if (value === undefined || value.length === 0) return;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore malformed URLs — they would fail at fetch time anyway.
    }
  };
  consider(speech.sttBaseUrl);
  consider(speech.ttsBaseUrl);
  if (speech.sttProvider === "sarvam" || speech.ttsProvider === "sarvam") {
    origins.add("https://api.sarvam.ai");
  }
  if (speech.sttProvider === "huggingface" || speech.ttsProvider === "huggingface") {
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

function isSynthesizeRequest(message: unknown): message is SynthesizeRequest {
  if (typeof message !== "object" || message === null) return false;
  const candidate = message as Partial<SynthesizeRequest>;
  return (
    candidate.type === "synthesize" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.text === "string"
  );
}

function decodeBase64(value: string): Uint8Array {
  const buffer = Buffer.from(value, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
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
    (candidate.planMode === undefined || typeof candidate.planMode === "boolean")
  );
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
