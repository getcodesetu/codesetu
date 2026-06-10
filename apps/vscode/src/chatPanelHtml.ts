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

export interface RenderChatPanelHtmlOptions {
  cspSource: string;
  nonce: string;
  /** Human-readable "provider · model" shown in the composer (real, configured values). */
  modelLabel: string;
  /** Slash commands available in the composer palette. */
  slashCommands?: ReadonlyArray<{ command: string; skillName: string; description: string }>;
  /**
   * Origin allowlist used in the CSP `connect-src` so the webview can talk to
   * the configured speech endpoint (Sarvam / HF / OpenAI / local Whisper).
   * Always includes 'self'.
   */
  speechConnectSources?: ReadonlyArray<string>;
  /** Initial STT provider id (informs which mic path the webview activates). */
  speechSttProvider?: string;
  /** BCP-47 language code, e.g. "en-US", "hi-IN". */
  speechLanguage?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderChatPanelHtml(options: RenderChatPanelHtmlOptions): string {
  const modelLabel = escapeHtml(options.modelLabel);
  // Serialized into the script body via JSON. JSON.stringify can produce "</"
  // sequences that would close the script tag, so escape the slash.
  const slashCommandsJson = JSON.stringify(options.slashCommands ?? []).replace(/</g, "\\u003c");
  // CSP connect-src allowlist. 'self' covers the webview origin; any extra
  // entries are configured speech endpoints (Sarvam / HF / local Whisper).
  const connectSources = ["'self'", ...(options.speechConnectSources ?? [])].join(" ");
  const speechSttProvider = options.speechSttProvider ?? "browser";
  const speechLanguage = options.speechLanguage ?? "en-US";
  const speechConfigJson = JSON.stringify({
    sttProvider: speechSttProvider,
    language: speechLanguage,
  }).replace(/</g, "\\u003c");

  return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}'; media-src 'self' blob:; connect-src ${connectSources};"
    />
    <style>
      * {
        box-sizing: border-box;
      }

      body {
        min-height: 100vh;
        font-family: var(--vscode-font-family);
        margin: 0;
        padding: 16px;
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }

      main {
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-width: 820px;
        min-height: calc(100vh - 32px);
      }

      h1 {
        margin: 0;
        font-size: 30px;
        line-height: 1.15;
      }

      #transcript {
        display: grid;
        align-content: start;
        gap: 10px;
        flex: 1;
        min-height: 160px;
      }

      .message {
        border-radius: 10px;
        line-height: 1.5;
        padding: 11px 14px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }

      .user {
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
      }

      .approval-card {
        background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
        border: 1px solid var(--vscode-focusBorder, #555);
        white-space: normal;
      }
      .approval-title {
        font-weight: 600;
        margin-bottom: 8px;
      }
      .approval-detail {
        margin: 0 0 10px;
        max-height: 240px;
        overflow: auto;
        padding: 8px 10px;
        border-radius: 6px;
        background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.1));
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 12px;
        white-space: pre;
      }
      .approval-detail .diff-add {
        color: var(--vscode-gitDecoration-addedResourceForeground, #4caf50);
      }
      .approval-detail .diff-del {
        color: var(--vscode-gitDecoration-deletedResourceForeground, #f44336);
      }
      .approval-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .approval-btn {
        padding: 4px 12px;
        border-radius: 4px;
        border: 1px solid transparent;
        cursor: pointer;
        font-size: 12px;
      }
      .approval-btn.primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      .approval-btn.danger {
        background: transparent;
        color: var(--vscode-errorForeground, #f44);
        border-color: currentColor;
      }
      .approval-btn:not(.primary):not(.danger) {
        background: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, inherit);
        border-color: var(--vscode-button-border, var(--vscode-widget-border, #666));
      }
      .approval-status {
        font-size: 12px;
        opacity: 0.85;
      }

      .assistant {
        background: var(--vscode-editor-inactiveSelectionBackground);
        border: 1px solid rgba(127, 127, 127, 0.08);
        white-space: normal;
      }

      .assistant > :first-child {
        margin-top: 0;
      }

      .assistant pre {
        margin: 8px 0;
        padding: 10px 12px;
        overflow-x: auto;
        border-radius: 8px;
        background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.12));
        white-space: pre;
      }

      .assistant pre code {
        padding: 0;
        background: none;
      }

      .assistant code {
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.95em;
        padding: 1px 4px;
        border-radius: 4px;
        background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.12));
      }

      .assistant ul {
        margin: 6px 0;
        padding-left: 22px;
      }

      .error {
        background: var(--vscode-inputValidation-errorBackground);
        border: 1px solid var(--vscode-inputValidation-errorBorder);
      }

      /* Collapsible "thinking" + "context sent to AI" accordions. */
      .thinking,
      .context-preview {
        margin: 0 0 8px;
        border: 1px solid rgba(127, 127, 127, 0.18);
        border-radius: 8px;
        background: rgba(127, 127, 127, 0.05);
        font-size: 0.92em;
      }
      .context-preview {
        margin: -2px 0 4px;
      }
      .thinking[hidden] {
        display: none;
      }
      .thinking > summary,
      .context-preview > summary,
      .ctx-full > summary {
        cursor: pointer;
        padding: 6px 10px;
        color: var(--vscode-descriptionForeground, #888);
        user-select: none;
      }
      .thinking .think-body,
      .context-preview .ctx-body {
        padding: 2px 12px 10px;
        color: var(--vscode-descriptionForeground, #999);
        white-space: normal;
      }
      .think-label {
        font-style: italic;
      }
      .context-preview .ctx-row {
        margin: 5px 0;
      }
      .context-preview .ctx-label {
        opacity: 0.8;
      }
      .ctx-full {
        margin-top: 8px;
        border: none;
        background: none;
      }
      .ctx-full > summary {
        padding: 4px 0;
      }
      .answer > :first-child {
        margin-top: 0;
      }

      .composer-wrap {
        position: relative;
        display: grid;
        gap: 10px;
      }

      .composer-shell {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 120px;
        padding: 16px 18px 14px;
        border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
        border-radius: 20px;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.08);
        transition:
          border-color 120ms ease,
          box-shadow 120ms ease;
      }

      .composer-shell:focus-within {
        border-color: var(--vscode-focusBorder);
        box-shadow:
          0 0 0 2px color-mix(in srgb, var(--vscode-focusBorder) 18%, transparent),
          0 16px 42px rgba(0, 0, 0, 0.1);
      }

      textarea {
        width: 100%;
        flex: 1;
        min-height: 64px;
        max-height: 180px;
        resize: none;
        overflow-y: auto;
        color: var(--vscode-input-foreground);
        background: transparent;
        border: 0;
        outline: none;
        padding: 0;
        font: inherit;
        line-height: 1.45;
      }

      textarea::placeholder {
        color: var(--vscode-input-placeholderForeground);
      }

      .composer-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        min-height: 36px;
      }

      .toolbar-group {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .toolbar-group.secondary {
        justify-self: end;
      }

      button {
        font: inherit;
      }

      .icon-button,
      .send-button,
      .menu-row {
        border: 0;
        color: var(--vscode-foreground);
        background: transparent;
      }

      .icon-button,
      .send-button {
        display: inline-grid;
        place-items: center;
        width: 34px;
        height: 34px;
        padding: 0;
        border-radius: 50%;
      }

      .icon-button {
        border: 1px solid transparent;
        color: var(--vscode-descriptionForeground);
      }

      .icon-button:hover,
      .menu-row:hover {
        background: var(--vscode-toolbar-hoverBackground);
      }

      .icon-button:focus-visible,
      .send-button:focus-visible,
      .menu-row:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
      }

      textarea:focus-visible {
        outline: none;
      }

      .model-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 30px;
        padding: 0 8px;
        border: 0;
        border-radius: 9px;
        color: var(--vscode-descriptionForeground);
        background: transparent;
        white-space: nowrap;
        cursor: pointer;
        font: inherit;
      }

      .model-chip:hover {
        background: var(--vscode-toolbar-hoverBackground);
      }

      .model-chip:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
      }

      .model-chip:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .chevron {
        width: 14px;
        height: 14px;
        opacity: 0.8;
      }

      .send-button {
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
        width: 38px;
        height: 38px;
      }

      .send-button:hover {
        background: var(--vscode-button-hoverBackground);
      }

      .send-button:disabled,
      textarea:disabled,
      .icon-button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .composer-icon {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }

      .icon-button .composer-icon {
        width: 21px;
        height: 21px;
      }

      .send-button .composer-icon {
        width: 22px;
        height: 22px;
        stroke-width: 2.4;
      }

      .menu {
        position: absolute;
        z-index: 10;
        min-width: 268px;
        padding: 8px;
        border: 1px solid var(--vscode-widget-border);
        border-radius: 12px;
        color: var(--vscode-menu-foreground, var(--vscode-foreground));
        background: var(--vscode-menu-background, var(--vscode-editorWidget-background));
        box-shadow: 0 16px 42px rgba(0, 0, 0, 0.22);
      }

      .menu[hidden] {
        display: none;
      }

      .composer-menu {
        left: 0;
        bottom: 54px;
      }

      .menu-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        width: 100%;
        min-height: 36px;
        padding: 7px 10px;
        border-radius: 8px;
        text-align: left;
      }

      .menu-leading {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }

      .menu-icon {
        display: inline-grid;
        place-items: center;
        width: 20px;
        height: 20px;
        flex: 0 0 auto;
        color: var(--vscode-descriptionForeground);
      }

      .switch {
        position: relative;
        display: inline-flex;
        width: 38px;
        height: 22px;
      }

      .switch input {
        position: absolute;
        inset: 0;
        opacity: 0;
      }

      .switch-track {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: var(--vscode-inputOption-activeBorder, var(--vscode-widget-border));
        opacity: 0.45;
      }

      .switch-track::after {
        content: "";
        position: absolute;
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: var(--vscode-input-background);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        transition: transform 120ms ease;
      }

      .switch input:checked + .switch-track {
        background: var(--vscode-button-background);
        opacity: 1;
      }

      .switch input:checked + .switch-track::after {
        transform: translateX(16px);
      }

      .mode-pill {
        display: none;
        align-items: center;
        gap: 6px;
        min-height: 24px;
        padding: 0 9px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--vscode-button-background) 18%, transparent);
        color: var(--vscode-button-background);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.6px;
        text-transform: uppercase;
      }

      .mode-pill[data-active="true"] {
        display: inline-flex;
      }

      .mode-pill .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--vscode-button-background);
      }

      .approve-row {
        display: none;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      }

      .approve-row[data-show="true"] {
        display: inline-flex;
      }

      .approve-button {
        padding: 6px 12px;
        border: 0;
        border-radius: 7px;
        cursor: pointer;
        font: inherit;
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
      }

      .approve-button:hover {
        background: var(--vscode-button-hoverBackground);
      }

      .approve-hint {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }

      .slash-menu {
        left: 0;
        right: auto;
        bottom: 54px;
        max-width: 420px;
      }

      .slash-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 10px;
        width: 100%;
        padding: 7px 10px;
        border: 0;
        border-radius: 8px;
        text-align: left;
        background: transparent;
        color: var(--vscode-foreground);
        cursor: pointer;
      }

      .slash-row[aria-selected="true"],
      .slash-row:hover {
        background: var(--vscode-toolbar-hoverBackground);
      }

      .slash-row .cmd {
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.9em;
        color: var(--vscode-button-background);
      }

      .slash-row .meta {
        display: grid;
        gap: 2px;
        min-width: 0;
      }

      .slash-row .name {
        font-weight: 600;
      }

      .slash-row .desc {
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .mic-button[data-state="listening"] {
        color: #d24a4a;
        background: color-mix(in srgb, #d24a4a 14%, transparent);
      }

      .mic-button[data-state="listening"]::after {
        content: "";
        position: absolute;
        inset: -2px;
        border-radius: 50%;
        border: 2px solid #d24a4a;
        opacity: 0.6;
        animation: codesetuMicPulse 1.2s ease-out infinite;
      }

      .mic-button {
        position: relative;
      }

      .mic-button[data-state="transcribing"] {
        opacity: 0.7;
      }

      @keyframes codesetuMicPulse {
        0% { transform: scale(1); opacity: 0.6; }
        100% { transform: scale(1.4); opacity: 0; }
      }

      .speech-status {
        margin-top: 6px;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        min-height: 16px;
      }

      .speech-status.error {
        color: var(--vscode-inputValidation-errorForeground, #d24a4a);
      }

      @media (max-width: 520px) {
        body {
          padding: 12px;
        }

        main {
          min-height: calc(100vh - 24px);
        }

        h1 {
          font-size: 24px;
        }

        .composer-shell {
          min-height: 124px;
          border-radius: 14px;
        }
      }
    </style>
    <title>CodeSetu</title>
  </head>
  <body>
    <main>
      <h1>CodeSetu</h1>
      <section id="transcript" aria-live="polite"></section>
      <form id="chat-form" class="composer-wrap">
        <div class="composer-shell">
          <textarea id="message" aria-label="Message" placeholder="Ask CodeSetu"></textarea>
          <div class="composer-toolbar">
            <div class="toolbar-group">
              <button
                id="composer-menu-toggle"
                class="icon-button"
                type="button"
                aria-label="Open composer menu"
                aria-expanded="false"
              >
                <svg class="composer-icon" data-icon="plus" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </button>
              <span
                id="plan-mode-pill"
                class="mode-pill"
                data-active="false"
                title="Plan Mode is active — the assistant will plan, not edit"
              >
                <span class="dot" aria-hidden="true"></span>
                Plan
              </span>
              <span
                id="agent-mode-pill"
                class="mode-pill"
                data-active="false"
                title="Agent Mode is active — the assistant can edit files and run commands (with your approval)"
              >
                <span class="dot" aria-hidden="true"></span>
                Agent
              </span>
            </div>
            <div class="toolbar-group secondary">
              <!--
                Mic/dictation is HIDDEN for now. The host-side capture pipeline
                (extension-host SoX/ffmpeg recorder → server STT provider) exists
                in dictation.ts and is wired up, but the feature is parked while
                we focus elsewhere. To re-enable: remove hidden/display:none here
                and flip DICTATION_ENABLED to true in the script below.
                (VS Code webviews can't reach the mic directly — microsoft/vscode#250568.)
              -->
              <button
                id="mic-button"
                class="icon-button mic-button"
                type="button"
                data-state="idle"
                aria-label="Dictate"
                title="Dictate — tap to toggle, hold for push-to-talk"
                hidden
                style="display: none"
              >
                <svg class="composer-icon" data-icon="mic" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0" />
                  <path d="M12 18v3" />
                </svg>
              </button>
              <button id="model-chip" class="model-chip" type="button" aria-label="Select model" title="Click to switch model">
                <span id="model-label">${modelLabel}</span>
                <svg class="composer-icon chevron" data-icon="chevron-down" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <button id="send" class="send-button" type="submit" aria-label="Send message">
                <svg class="composer-icon" data-icon="send" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
              <button
                id="stop"
                class="send-button"
                type="button"
                aria-label="Stop"
                title="Stop"
                hidden
                style="display: none"
              >
                <svg class="composer-icon" data-icon="stop" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="1.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div id="composer-menu" class="menu composer-menu" hidden>
          <label class="menu-row">
            <span class="menu-leading">
              <span class="menu-icon">
                <svg class="composer-icon" data-icon="sparkle" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m12 3 1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8z" />
                  <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
                </svg>
              </span>
              Include IDE context
            </span>
            <span class="switch">
              <input id="include-context" type="checkbox" checked />
              <span class="switch-track"></span>
            </span>
          </label>
          <label class="menu-row">
            <span class="menu-leading">
              <span class="menu-icon">
                <svg class="composer-icon" data-icon="plan" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 6h12" />
                  <path d="M4 12h16" />
                  <path d="M4 18h8" />
                  <path d="m17 16 2 2 4-4" />
                </svg>
              </span>
              Plan Mode
            </span>
            <span class="switch">
              <input id="plan-mode" type="checkbox" />
              <span class="switch-track"></span>
            </span>
          </label>
          <label class="menu-row">
            <span class="menu-leading">
              <span class="menu-icon">
                <svg class="composer-icon" data-icon="agent" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v3" />
                  <rect x="5" y="6" width="14" height="12" rx="2" />
                  <path d="M9 11h.01M15 11h.01M9 15h6" />
                </svg>
              </span>
              Agent Mode
            </span>
            <span class="switch">
              <input id="agent-mode" type="checkbox" />
              <span class="switch-track"></span>
            </span>
          </label>
        </div>
        <div id="slash-menu" class="menu slash-menu" hidden role="listbox" aria-label="Slash commands"></div>
        <div id="approve-row" class="approve-row" data-show="false">
          <button id="approve-run" class="approve-button" type="button">Approve &amp; Run</button>
          <span class="approve-hint">Sends "${escapeHtml("APPROVED — proceed with implementation")}" and exits Plan Mode.</span>
        </div>
        <div id="speech-status" class="speech-status" aria-live="polite"></div>
      </form>
    </main>
    <script nonce="${options.nonce}">
      const vscode = acquireVsCodeApi();
      const form = document.getElementById("chat-form");
      const textarea = document.getElementById("message");
      const send = document.getElementById("send");
      const stopButton = document.getElementById("stop");
      const transcript = document.getElementById("transcript");
      const composerMenuToggle = document.getElementById("composer-menu-toggle");
      const composerMenu = document.getElementById("composer-menu");
      const includeContext = document.getElementById("include-context");
      const planModeToggle = document.getElementById("plan-mode");
      const planModePill = document.getElementById("plan-mode-pill");
      const agentModeToggle = document.getElementById("agent-mode");
      const agentModePill = document.getElementById("agent-mode-pill");
      const approveRow = document.getElementById("approve-row");
      const approveRunButton = document.getElementById("approve-run");
      const modelChip = document.getElementById("model-chip");
      const modelLabel = document.getElementById("model-label");
      // The in-progress assistant turn: DOM refs + accumulated content/reasoning.
      // undefined when no turn is streaming.
      let activeAssistant;
      // Tracks whether the most recent assistant turn was produced under plan
      // mode. When true and plan mode is still on, the Approve & Run row shows.
      let lastTurnWasPlan = false;

      // Persist plan-mode and include-context across reloads using webview state.
      const savedState = vscode.getState() || {};
      if (savedState.planMode === true) {
        planModeToggle.checked = true;
      }
      if (savedState.agentMode === true) {
        agentModeToggle.checked = true;
      }
      if (savedState.includeContext === false) {
        includeContext.checked = false;
      }

      function persistState() {
        vscode.setState({
          planMode: planModeToggle.checked,
          agentMode: agentModeToggle.checked,
          includeContext: includeContext.checked,
        });
      }

      function updateModeUi() {
        planModePill.setAttribute("data-active", String(planModeToggle.checked));
        agentModePill.setAttribute("data-active", String(agentModeToggle.checked));
        const showApprove = planModeToggle.checked && lastTurnWasPlan;
        approveRow.setAttribute("data-show", String(showApprove));
      }
      // Back-compat alias: existing call sites still invoke updatePlanModeUi().
      const updatePlanModeUi = updateModeUi;

      updateModeUi();

      function postModeUiState() {
        vscode.postMessage({
          type: "uiState",
          planMode: planModeToggle.checked,
          agentMode: agentModeToggle.checked,
        });
      }
      // Back-compat alias for existing call sites.
      const postPlanModeUiState = postModeUiState;

      planModeToggle.addEventListener("change", () => {
        // Plan ("don't edit, just plan") and Agent ("edit and run") are opposites;
        // turning one on turns the other off.
        if (planModeToggle.checked) {
          agentModeToggle.checked = false;
        }
        persistState();
        updateModeUi();
        postModeUiState();
      });
      agentModeToggle.addEventListener("change", () => {
        if (agentModeToggle.checked) {
          planModeToggle.checked = false;
        }
        persistState();
        updateModeUi();
        postModeUiState();
      });
      includeContext.addEventListener("change", persistState);
      // Tell the host the initial mode state so editor-action submissions
      // (which don't go through the composer) inherit it.
      postModeUiState();

      // Slash command palette ---------------------------------------------------
      const slashCommands = ${slashCommandsJson};
      const slashMenu = document.getElementById("slash-menu");
      let slashSelectedIndex = 0;
      let slashFiltered = [];

      function escapeAttr(value) {
        return String(value)
          .split("&").join("&amp;")
          .split('"').join("&quot;")
          .split("<").join("&lt;")
          .split(">").join("&gt;");
      }

      function renderSlashMenu(filter) {
        slashFiltered = slashCommands.filter((entry) =>
          entry.command.toLowerCase().startsWith(filter.toLowerCase()),
        );
        if (slashFiltered.length === 0) {
          slashMenu.hidden = true;
          return;
        }
        slashSelectedIndex = 0;
        slashMenu.innerHTML = slashFiltered
          .map((entry, index) =>
            '<button type="button" class="slash-row" role="option" data-index="' +
            index +
            '" aria-selected="' +
            (index === 0 ? "true" : "false") +
            '"><span class="cmd">' +
            escapeAttr(entry.command) +
            '</span><span class="meta"><span class="name">' +
            escapeAttr(entry.skillName) +
            '</span><span class="desc">' +
            escapeAttr(entry.description) +
            "</span></span></button>",
          )
          .join("");
        slashMenu.hidden = false;
      }

      function closeSlashMenu() {
        slashMenu.hidden = true;
        slashFiltered = [];
      }

      function updateSlashSelection(direction) {
        if (slashFiltered.length === 0) return;
        slashSelectedIndex =
          (slashSelectedIndex + direction + slashFiltered.length) % slashFiltered.length;
        const rows = slashMenu.querySelectorAll(".slash-row");
        rows.forEach((row, idx) => {
          row.setAttribute("aria-selected", idx === slashSelectedIndex ? "true" : "false");
        });
      }

      function applySlashSelection() {
        if (slashFiltered.length === 0) return false;
        const entry = slashFiltered[slashSelectedIndex];
        if (!entry) return false;
        // Replace only the command token, keeping anything typed after it.
        const text = textarea.value;
        const firstSpace = text.search(/\\s/);
        const rest = firstSpace === -1 ? "" : text.slice(firstSpace);
        textarea.value = entry.command + (rest.length > 0 ? rest : " ");
        const caret = entry.command.length + 1;
        textarea.setSelectionRange(caret, caret);
        closeSlashMenu();
        return true;
      }

      function maybeOpenSlashMenu() {
        const text = textarea.value;
        if (slashCommands.length === 0 || text.length === 0 || text.charAt(0) !== "/") {
          closeSlashMenu();
          return;
        }
        const firstSpace = text.search(/\\s/);
        // Once a space follows the command, the user is writing their message,
        // not picking a command — close the palette so Enter sends normally
        // (otherwise Enter re-selects from the menu and wipes the message).
        if (firstSpace !== -1) {
          closeSlashMenu();
          return;
        }
        // Mutually exclusive with the composer (+) menu.
        setMenuOpen(false);
        renderSlashMenu(text);
      }

      textarea.addEventListener("input", maybeOpenSlashMenu);
      textarea.addEventListener("keydown", (event) => {
        if (slashMenu.hidden) {
          // Palette closed: Enter sends, Shift+Enter inserts a newline.
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            form.requestSubmit();
          }
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          updateSlashSelection(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          updateSlashSelection(-1);
        } else if (event.key === "Enter" || event.key === "Tab") {
          if (applySlashSelection()) {
            event.preventDefault();
          }
        } else if (event.key === "Escape") {
          event.preventDefault();
          closeSlashMenu();
        }
      });
      slashMenu.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target.closest(".slash-row") : null;
        if (!target) return;
        const index = Number(target.getAttribute("data-index"));
        if (Number.isFinite(index)) {
          slashSelectedIndex = index;
          applySlashSelection();
          textarea.focus();
        }
      });

      // Voice (STT only) ---------------------------------------------------------
      // Capture runs in the extension HOST, not here: VS Code webviews can't
      // reach the microphone (sandboxed iframe, no allow="microphone" —
      // microsoft/vscode#250568). The mic button just toggles host-side
      // dictation and renders the state the host posts back. The host records
      // via a CLI (SoX/ffmpeg) and transcribes with the configured server STT
      // provider (Sarvam / OpenAI-compatible / Hugging Face).
      const speechConfig = ${speechConfigJson};
      const micButton = document.getElementById("mic-button");
      const speechStatus = document.getElementById("speech-status");

      function setSpeechStatus(text, isError) {
        speechStatus.textContent = text || "";
        speechStatus.classList.toggle("error", Boolean(isError));
      }

      function setMicState(state) {
        micButton.setAttribute("data-state", state);
      }

      let listening = false;

      // Dictation is parked for now: the mic button is hidden and both it and
      // spacebar push-to-talk funnel through startListening(), so this single
      // flag keeps the feature dormant. Flip to true (and unhide the button) to
      // bring back host-side dictation.
      const DICTATION_ENABLED = false;

      function appendToTextarea(text) {
        if (!text) return;
        const trimmed = String(text).trim();
        if (trimmed.length === 0) return;
        const separator = textarea.value.length > 0 && !textarea.value.endsWith(" ") ? " " : "";
        textarea.value += separator + trimmed;
        textarea.dispatchEvent(new Event("input"));
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }

      function startListening() {
        if (!DICTATION_ENABLED) return;
        if (listening) return;
        // Optimistic: a second tap can stop before the host confirms "recording".
        listening = true;
        setMicState("listening");
        setSpeechStatus("Starting mic…", false);
        vscode.postMessage({ type: "dictation", action: "start" });
      }

      function stopListening() {
        if (!listening) {
          setMicState("idle");
          return;
        }
        listening = false;
        vscode.postMessage({ type: "dictation", action: "stop" });
      }

      // Host-driven dictation state: the host owns capture, so it tells us when
      // recording actually started, when it's transcribing, and when it's done.
      function applyDictationState(state) {
        if (state === "recording") {
          listening = true;
          setMicState("listening");
          setSpeechStatus("Listening… (tap mic to stop)", false);
        } else if (state === "transcribing") {
          setMicState("transcribing");
          setSpeechStatus("Transcribing…", false);
        } else {
          listening = false;
          setMicState("idle");
          // Leave any error text in place; clear only the transient statuses.
          if (!speechStatus.classList.contains("error")) setSpeechStatus("", false);
        }
      }

      // Mic UX: pointerdown >250ms = push-to-talk (release stops); shorter
      // press = tap-to-toggle. Spacebar in an empty/focused composer also
      // triggers push-to-talk. Esc stops an active capture.
      const HOLD_THRESHOLD_MS = 250;
      let pressTimer;
      let holdMode = false;

      function startHoldMode() {
        holdMode = true;
        startListening();
      }

      // Set when a pointerdown stops an in-progress capture, so the matching
      // pointerup doesn't immediately re-start it. (stopListening() flips
      // "listening" to false synchronously, so endMicPress can't rely on it.)
      let suppressTapStart = false;

      micButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (listening && !holdMode) {
          // A second tap while a tap-toggled capture is running just stops it.
          stopListening();
          suppressTapStart = true;
          return;
        }
        if (listening) return;
        holdMode = false;
        if (pressTimer) clearTimeout(pressTimer);
        pressTimer = setTimeout(startHoldMode, HOLD_THRESHOLD_MS);
      });

      function endMicPress() {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = undefined;
        }
        if (suppressTapStart) {
          suppressTapStart = false;
          return;
        }
        if (holdMode) {
          stopListening();
          holdMode = false;
        } else if (!listening) {
          // Short tap with no active capture starts listening (tap-toggle on).
          startListening();
        }
      }

      micButton.addEventListener("pointerup", endMicPress);
      micButton.addEventListener("pointerleave", () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = undefined;
        }
      });
      micButton.addEventListener("pointercancel", endMicPress);

      let spaceHeld = false;
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && slashMenu.hidden && listening) {
          stopListening();
          return;
        }
        if (event.key !== " " || event.repeat || spaceHeld) return;
        if (document.activeElement !== textarea) return;
        if (textarea.value.length !== 0) return;
        event.preventDefault();
        spaceHeld = true;
        holdMode = true;
        startListening();
      });
      document.addEventListener("keyup", (event) => {
        if (event.key !== " " || !spaceHeld) return;
        event.preventDefault();
        spaceHeld = false;
        if (holdMode) {
          stopListening();
          holdMode = false;
        }
      });

      const NEWLINE = String.fromCharCode(10);
      const FENCE = String.fromCharCode(96, 96, 96);
      const TICK = String.fromCharCode(96);

      function escapeHtml(value) {
        return String(value)
          .split("&").join("&amp;")
          .split("<").join("&lt;")
          .split(">").join("&gt;");
      }

      function renderInline(escaped) {
        let bolded = "";
        let rest = escaped;
        while (true) {
          const open = rest.indexOf("**");
          if (open === -1) { bolded += rest; break; }
          const close = rest.indexOf("**", open + 2);
          if (close === -1) { bolded += rest; break; }
          bolded += rest.slice(0, open) + "<strong>" + rest.slice(open + 2, close) + "</strong>";
          rest = rest.slice(close + 2);
        }

        let out = "";
        let seg = bolded;
        while (true) {
          const start = seg.indexOf(TICK);
          if (start === -1) { out += seg; break; }
          const end = seg.indexOf(TICK, start + 1);
          if (end === -1) { out += seg; break; }
          out += seg.slice(0, start) + "<code>" + seg.slice(start + 1, end) + "</code>";
          seg = seg.slice(end + 1);
        }
        return out;
      }

      function renderProse(escaped) {
        if (escaped.split(NEWLINE).join("").trim() === "") {
          return "";
        }
        const lines = escaped.split(NEWLINE);
        let out = "";
        let inList = false;
        for (const line of lines) {
          const trimmed = line.trimStart();
          const isItem = trimmed.indexOf("- ") === 0 || trimmed.indexOf("* ") === 0;
          if (isItem) {
            if (!inList) { out += "<ul>"; inList = true; }
            out += "<li>" + renderInline(trimmed.slice(2)) + "</li>";
          } else {
            if (inList) { out += "</ul>"; inList = false; }
            out += line.trim() === "" ? "<br>" : renderInline(line) + "<br>";
          }
        }
        if (inList) { out += "</ul>"; }
        return out;
      }

      // Renders a safe subset of markdown. All model text is HTML-escaped before
      // any tags are introduced, so this never injects untrusted markup.
      function renderMarkdown(raw) {
        const parts = String(raw).split(FENCE);
        let html = "";
        for (let i = 0; i < parts.length; i++) {
          if (i % 2 === 1) {
            let block = parts[i];
            const firstNewline = block.indexOf(NEWLINE);
            let code = firstNewline === -1 ? block : block.slice(firstNewline + 1);
            if (code.length > 0 && code.charAt(code.length - 1) === NEWLINE) {
              code = code.slice(0, code.length - 1);
            }
            html += "<pre><code>" + escapeHtml(code) + "</code></pre>";
          } else {
            html += renderProse(escapeHtml(parts[i]));
          }
        }
        return html;
      }

      function appendMessage(kind, text) {
        const message = document.createElement("article");
        message.className = "message " + kind;
        if (kind === "assistant") {
          message.innerHTML = renderMarkdown(text);
        } else {
          message.textContent = text;
        }
        transcript.appendChild(message);
        message.scrollIntoView({ block: "end", behavior: "smooth" });
        return message;
      }

      // Inline tool-approval card: replaces the native modal so the user
      // approves/denies a mutating tool call right in the chat.
      function appendApprovalCard(id, tool, detail) {
        const card = document.createElement("article");
        card.className = "message approval-card";

        const title = document.createElement("div");
        title.className = "approval-title";
        title.textContent = "Allow " + tool + "?";
        card.appendChild(title);

        const pre = document.createElement("pre");
        pre.className = "approval-detail";
        for (const line of String(detail).split("\\n")) {
          const span = document.createElement("span");
          if (line.startsWith("+")) span.className = "diff-add";
          else if (line.startsWith("-")) span.className = "diff-del";
          span.textContent = line + "\\n";
          pre.appendChild(span);
        }
        card.appendChild(pre);

        const actions = document.createElement("div");
        actions.className = "approval-actions";
        const respond = (decision, label) => {
          vscode.postMessage({ type: "toolApprovalResponse", id, decision });
          actions.remove();
          const status = document.createElement("div");
          status.className = "approval-status";
          status.textContent = label;
          card.appendChild(status);
        };
        const makeButton = (label, decision, statusLabel, cls) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "approval-btn " + cls;
          button.textContent = label;
          button.addEventListener("click", () => respond(decision, statusLabel));
          return button;
        };
        actions.appendChild(makeButton("Approve", "approve", "✓ Approved", "primary"));
        actions.appendChild(
          makeButton("Approve for session", "approve_always", "✓ Approved for session", ""),
        );
        actions.appendChild(makeButton("Deny", "deny", "🚫 Denied", "danger"));
        card.appendChild(actions);

        transcript.appendChild(card);
        card.scrollIntoView({ block: "end", behavior: "smooth" });
      }

      // Split answer text from reasoning the model emitted inline as
      // <think>…</think>. Handles multiple blocks and an unclosed trailing tag
      // (everything after it is thinking until </think> arrives). Runs on the
      // accumulated text each render, so it's robust to chunk boundaries.
      function splitThink(raw) {
        let think = "";
        let answer = "";
        let rest = String(raw);
        while (true) {
          const open = rest.indexOf("<think>");
          if (open === -1) { answer += rest; break; }
          answer += rest.slice(0, open);
          const after = rest.slice(open + 7);
          const close = after.indexOf("</think>");
          if (close === -1) { think += after; break; }
          think += after.slice(0, close);
          rest = after.slice(close + 8);
        }
        return { think: think, answer: answer };
      }

      function startAssistantMessage() {
        const article = document.createElement("article");
        article.className = "message assistant";

        const thinking = document.createElement("details");
        thinking.className = "thinking";
        thinking.hidden = true;
        thinking.open = true;
        const summary = document.createElement("summary");
        const thinkLabel = document.createElement("span");
        thinkLabel.className = "think-label";
        thinkLabel.textContent = "Thinking…";
        summary.appendChild(thinkLabel);
        const thinkBody = document.createElement("div");
        thinkBody.className = "think-body";
        thinking.appendChild(summary);
        thinking.appendChild(thinkBody);

        const answer = document.createElement("div");
        answer.className = "answer";

        article.appendChild(thinking);
        article.appendChild(answer);
        transcript.appendChild(article);
        article.scrollIntoView({ block: "end", behavior: "smooth" });

        activeAssistant = {
          article: article,
          thinking: thinking,
          thinkLabel: thinkLabel,
          thinkBody: thinkBody,
          answer: answer,
          content: "",
          reasoning: "",
          thinkStart: 0,
          thinkDone: false,
        };
        return activeAssistant;
      }

      function renderActiveAssistant() {
        const a = activeAssistant;
        if (!a) return;
        const split = splitThink(a.content);
        const thinkingText =
          a.reasoning + (a.reasoning && split.think ? NEWLINE : "") + split.think;

        if (thinkingText.trim().length > 0) {
          if (a.thinkStart === 0) a.thinkStart = Date.now();
          a.thinking.hidden = false;
          a.thinkBody.innerHTML = renderMarkdown(thinkingText);
        }

        a.answer.innerHTML = renderMarkdown(split.answer);

        // Once the real answer starts, stamp "Thought for Ns" and collapse.
        if (!a.thinkDone && a.thinkStart > 0 && split.answer.trim().length > 0) {
          a.thinkDone = true;
          const secs = Math.max(1, Math.round((Date.now() - a.thinkStart) / 1000));
          a.thinkLabel.textContent = "Thought for " + secs + "s";
          a.thinking.open = false;
        }

        a.article.scrollIntoView({ block: "end", behavior: "smooth" });
      }

      function appendAssistantReasoning(text) {
        if (!activeAssistant) startAssistantMessage();
        if (activeAssistant.thinkStart === 0) activeAssistant.thinkStart = Date.now();
        activeAssistant.reasoning += text;
        renderActiveAssistant();
      }

      function appendAssistantDelta(text) {
        if (!activeAssistant) startAssistantMessage();
        activeAssistant.content += text;
        renderActiveAssistant();
      }

      // Finalize the streaming turn: if there was thinking but no answer text
      // closed it out, still stamp the elapsed label and collapse it.
      function finalizeAssistant() {
        const a = activeAssistant;
        if (!a) return;
        if (!a.thinkDone && a.thinkStart > 0) {
          const secs = Math.max(1, Math.round((Date.now() - a.thinkStart) / 1000));
          a.thinkLabel.textContent = "Thought for " + secs + "s";
          a.thinking.open = false;
        }
        activeAssistant = undefined;
      }

      function ctxRow(label, value) {
        const row = document.createElement("div");
        row.className = "ctx-row";
        const l = document.createElement("span");
        l.className = "ctx-label";
        l.textContent = label + ": ";
        row.appendChild(l);
        row.appendChild(document.createTextNode(value));
        return row;
      }

      function ctxPre(label, value) {
        const wrap = document.createElement("div");
        wrap.className = "ctx-row";
        const l = document.createElement("div");
        l.className = "ctx-label";
        l.textContent = label;
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = value;
        pre.appendChild(code);
        wrap.appendChild(l);
        wrap.appendChild(pre);
        return wrap;
      }

      // Render the "Context sent to AI" accordion under the current user turn.
      // All values use textContent — never innerHTML — so nothing the payload
      // contains can inject markup.
      function renderContextPreview(preview) {
        const ctx = preview.ideContext || {};
        const full = preview.full || {};

        const details = document.createElement("details");
        details.className = "context-preview";
        const summary = document.createElement("summary");
        summary.textContent = "Context sent to AI";
        details.appendChild(summary);

        const body = document.createElement("div");
        body.className = "ctx-body";

        const skills = (preview.skills || []).map((s) =>
          s.slash ? s.slash + " (" + s.name + ")" : s.name,
        );
        body.appendChild(ctxRow("Skill", skills.length ? skills.join(", ") : "(auto — none routed)"));

        if (ctx.activeFilePath) {
          body.appendChild(
            ctxRow("Active file", ctx.activeFilePath + (ctx.languageId ? " (" + ctx.languageId + ")" : "")),
          );
        }

        const selRow = document.createElement("div");
        selRow.className = "ctx-row";
        const selLabel = document.createElement("span");
        selLabel.className = "ctx-label";
        selLabel.textContent = "Selected code: ";
        selRow.appendChild(selLabel);
        if (ctx.hasSelection && ctx.selectedText) {
          const pre = document.createElement("pre");
          const code = document.createElement("code");
          code.textContent = ctx.selectedText;
          pre.appendChild(code);
          selRow.appendChild(pre);
        } else {
          selRow.appendChild(document.createTextNode("(none)"));
        }
        body.appendChild(selRow);

        body.appendChild(ctxRow("Related snippets", String(ctx.snippetCount || 0)));

        const fullDetails = document.createElement("details");
        fullDetails.className = "ctx-full";
        const fullSummary = document.createElement("summary");
        fullSummary.textContent = "View full payload";
        fullDetails.appendChild(fullSummary);
        if (full.systemPrompt) fullDetails.appendChild(ctxPre("System prompt", full.systemPrompt));
        if (full.contextMarkdown) fullDetails.appendChild(ctxPre("IDE context", full.contextMarkdown));
        body.appendChild(fullDetails);

        details.appendChild(body);
        transcript.appendChild(details);
        details.scrollIntoView({ block: "end", behavior: "smooth" });
      }

      function setMenuOpen(isOpen) {
        composerMenu.hidden = !isOpen;
        composerMenuToggle.setAttribute("aria-expanded", String(isOpen));
      }

      composerMenuToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const willOpen = composerMenu.hidden;
        if (willOpen) closeSlashMenu();
        setMenuOpen(willOpen);
      });

      modelChip.addEventListener("click", () => {
        setMenuOpen(false);
        vscode.postMessage({ type: "selectModel" });
      });

      document.addEventListener("click", (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        if (!target.closest(".menu") && !target.closest(".icon-button")) {
          setMenuOpen(false);
        }
      });

      // Set at send time, consumed when the assistant turn finishes so we can
      // show Approve & Run on plan-mode turns and only on plan-mode turns.
      let pendingTurnWasPlan = false;

      function sendUserMessage(text) {
        textarea.value = "";
        setMenuOpen(false);
        // Hide the approve row immediately so a rapid second send doesn't keep
        // it visible; it reappears only if the next assistant turn is a plan.
        lastTurnWasPlan = false;
        updatePlanModeUi();
        pendingTurnWasPlan = planModeToggle.checked;
        vscode.postMessage({
          type: "sendMessage",
          text,
          includeIdeContext: includeContext.checked,
          planMode: planModeToggle.checked,
          agentMode: agentModeToggle.checked,
        });
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = textarea.value.trim();

        if (text.length === 0) {
          return;
        }

        sendUserMessage(text);
      });

      stopButton.addEventListener("click", () => {
        vscode.postMessage({ type: "cancel" });
      });

      approveRunButton.addEventListener("click", () => {
        // Drop plan mode for this turn and the rest of the session, then send
        // the canonical approval phrase so the model implements the plan.
        planModeToggle.checked = false;
        persistState();
        updatePlanModeUi();
        sendUserMessage("APPROVED — proceed with implementation");
      });

      window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "contextPreview") {
          renderContextPreview(message.preview);
        }

        if (message.type === "assistantMessage") {
          // Non-streamed reply: render the whole thing in one go (still splits
          // out any inline <think> reasoning).
          if (!activeAssistant) startAssistantMessage();
          activeAssistant.content = message.text;
          renderActiveAssistant();
          finalizeAssistant();
          lastTurnWasPlan = pendingTurnWasPlan;
          updatePlanModeUi();
        }

        if (message.type === "assistantMessageStart") {
          startAssistantMessage();
        }

        if (message.type === "assistantReasoningDelta") {
          appendAssistantReasoning(message.text);
        }

        if (message.type === "assistantMessageDelta") {
          appendAssistantDelta(message.text);
        }

        if (message.type === "assistantMessageDone") {
          finalizeAssistant();
          lastTurnWasPlan = pendingTurnWasPlan;
          updatePlanModeUi();
        }

        if (message.type === "dictationState") {
          applyDictationState(message.state);
        }

        if (message.type === "dictationResult") {
          appendToTextarea(message.text);
        }

        if (message.type === "dictationError") {
          listening = false;
          setMicState("idle");
          setSpeechStatus(message.message || "Dictation error.", true);
        }

        if (message.type === "userMessage") {
          appendMessage("user", message.text);
        }

        if (message.type === "error") {
          appendMessage("error", message.text);
        }

        if (message.type === "toolApproval") {
          appendApprovalCard(message.id, message.tool, message.detail || "");
        }

        if (message.type === "modelLabel") {
          modelLabel.textContent = message.text;
        }

        if (message.type === "busy") {
          const isBusy = Boolean(message.value);
          // Swap Send for Stop while a turn is in flight so the user can cancel.
          send.hidden = isBusy;
          send.style.display = isBusy ? "none" : "";
          stopButton.hidden = !isBusy;
          stopButton.style.display = isBusy ? "" : "none";
          textarea.disabled = isBusy;
          composerMenuToggle.disabled = isBusy;
          modelChip.disabled = isBusy;
        }
      });
    </script>
  </body>
</html>`;
}
