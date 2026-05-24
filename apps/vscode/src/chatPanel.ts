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

import type { ChatMessage, IdeContextPayload } from "@codesetu/core";
import * as vscode from "vscode";

export interface ChatResponderContext {
  ideContext?: IdeContextPayload;
}

export interface SendUserMessageOptions {
  ideContext?: IdeContextPayload;
}

export type ChatResponder = (
  messages: ChatMessage[],
  context?: ChatResponderContext,
) => Promise<string>;

interface SendMessageRequest {
  type: "sendMessage";
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

    ChatPanel.currentPanel = new ChatPanel(panel, responder, outputChannel);
  }

  public static async createOrShowAndSend(
    extensionUri: vscode.Uri,
    responder: ChatResponder,
    outputChannel: vscode.OutputChannel,
    text: string,
    options: SendUserMessageOptions = {},
  ): Promise<void> {
    ChatPanel.createOrShow(extensionUri, responder, outputChannel);
    await ChatPanel.currentPanel?.sendUserMessage(text, options);
  }

  public async sendUserMessage(text: string, options: SendUserMessageOptions = {}): Promise<void> {
    await this.submitMessage(text, options);
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isSendMessageRequest(message) || this.inFlight) {
      return;
    }

    await this.submitMessage(message.text);
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

    try {
      const response = await this.responder(
        this.history,
        options.ideContext === undefined ? undefined : { ideContext: options.ideContext },
      );
      this.history.push({ role: "assistant", content: response });
      void this.panel.webview.postMessage({ type: "assistantMessage", text: response });
    } catch (error: unknown) {
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

  private renderHtml(webview: vscode.Webview): string {
    const nonce = crypto.randomUUID();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <style>
      body {
        box-sizing: border-box;
        font-family: var(--vscode-font-family);
        margin: 0;
        padding: 16px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }

      main {
        display: grid;
        gap: 12px;
        max-width: 720px;
      }

      #transcript {
        display: grid;
        gap: 10px;
        min-height: 160px;
      }

      .message {
        border-radius: 6px;
        line-height: 1.5;
        padding: 10px 12px;
        white-space: pre-wrap;
      }

      .user {
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
      }

      .assistant {
        background: var(--vscode-editor-inactiveSelectionBackground);
      }

      .error {
        background: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
      }

      form {
        display: grid;
        gap: 10px;
      }

      textarea {
        min-height: 112px;
        resize: vertical;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 10px;
      }

      button {
        justify-self: start;
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        border: 0;
        border-radius: 4px;
        padding: 8px 12px;
      }
    </style>
    <title>CodeSetu</title>
  </head>
  <body>
    <main>
      <h1>CodeSetu</h1>
      <section id="transcript" aria-live="polite"></section>
      <form id="chat-form">
        <textarea id="message" aria-label="Message" placeholder="Ask CodeSetu"></textarea>
        <button id="send" type="submit">Send</button>
      </form>
    </main>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const form = document.getElementById("chat-form");
      const textarea = document.getElementById("message");
      const send = document.getElementById("send");
      const transcript = document.getElementById("transcript");

      function appendMessage(kind, text) {
        const message = document.createElement("article");
        message.className = "message " + kind;
        message.textContent = text;
        transcript.appendChild(message);
        message.scrollIntoView({ block: "end", behavior: "smooth" });
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = textarea.value.trim();

        if (text.length === 0) {
          return;
        }

        textarea.value = "";
        vscode.postMessage({ type: "sendMessage", text });
      });

      window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "assistantMessage") {
          appendMessage("assistant", message.text);
        }

        if (message.type === "userMessage") {
          appendMessage("user", message.text);
        }

        if (message.type === "error") {
          appendMessage("error", message.text);
        }

        if (message.type === "busy") {
          send.disabled = Boolean(message.value);
          textarea.disabled = Boolean(message.value);
        }
      });
    </script>
  </body>
</html>`;
  }
}

function isSendMessageRequest(message: unknown): message is SendMessageRequest {
  if (typeof message !== "object" || message === null) {
    return false;
  }

  const candidate = message as Partial<SendMessageRequest>;
  return candidate.type === "sendMessage" && typeof candidate.text === "string";
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
