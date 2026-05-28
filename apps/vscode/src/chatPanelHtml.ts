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

  return /* html */ `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${options.cspSource} 'unsafe-inline'; script-src 'nonce-${options.nonce}';"
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
                title="Plan mode is active — the assistant will plan, not edit"
              >
                <span class="dot" aria-hidden="true"></span>
                Plan
              </span>
            </div>
            <div class="toolbar-group secondary">
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
        </div>
        <div id="approve-row" class="approve-row" data-show="false">
          <button id="approve-run" class="approve-button" type="button">Approve &amp; Run</button>
          <span class="approve-hint">Sends "${escapeHtml("APPROVED — proceed with implementation")}" and exits Plan Mode.</span>
        </div>
      </form>
    </main>
    <script nonce="${options.nonce}">
      const vscode = acquireVsCodeApi();
      const form = document.getElementById("chat-form");
      const textarea = document.getElementById("message");
      const send = document.getElementById("send");
      const transcript = document.getElementById("transcript");
      const composerMenuToggle = document.getElementById("composer-menu-toggle");
      const composerMenu = document.getElementById("composer-menu");
      const includeContext = document.getElementById("include-context");
      const planModeToggle = document.getElementById("plan-mode");
      const planModePill = document.getElementById("plan-mode-pill");
      const approveRow = document.getElementById("approve-row");
      const approveRunButton = document.getElementById("approve-run");
      const modelChip = document.getElementById("model-chip");
      const modelLabel = document.getElementById("model-label");
      let activeAssistantMessage;
      let activeAssistantRaw = "";
      // Tracks whether the most recent assistant turn was produced under plan
      // mode. When true and plan mode is still on, the Approve & Run row shows.
      let lastTurnWasPlan = false;

      // Persist plan-mode and include-context across reloads using webview state.
      const savedState = vscode.getState() || {};
      if (savedState.planMode === true) {
        planModeToggle.checked = true;
      }
      if (savedState.includeContext === false) {
        includeContext.checked = false;
      }

      function persistState() {
        vscode.setState({
          planMode: planModeToggle.checked,
          includeContext: includeContext.checked,
        });
      }

      function updatePlanModeUi() {
        planModePill.setAttribute("data-active", String(planModeToggle.checked));
        const showApprove = planModeToggle.checked && lastTurnWasPlan;
        approveRow.setAttribute("data-show", String(showApprove));
      }

      updatePlanModeUi();

      planModeToggle.addEventListener("change", () => {
        persistState();
        updatePlanModeUi();
      });
      includeContext.addEventListener("change", persistState);

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

      function startAssistantMessage() {
        activeAssistantRaw = "";
        activeAssistantMessage = appendMessage("assistant", "");
        return activeAssistantMessage;
      }

      function appendAssistantDelta(text) {
        if (!activeAssistantMessage) {
          startAssistantMessage();
        }

        activeAssistantRaw += text;
        activeAssistantMessage.innerHTML = renderMarkdown(activeAssistantRaw);
        activeAssistantMessage.scrollIntoView({ block: "end", behavior: "smooth" });
      }

      function setMenuOpen(isOpen) {
        composerMenu.hidden = !isOpen;
        composerMenuToggle.setAttribute("aria-expanded", String(isOpen));
      }

      composerMenuToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setMenuOpen(composerMenu.hidden);
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

        if (message.type === "assistantMessage") {
          if (activeAssistantMessage) {
            activeAssistantMessage.innerHTML = renderMarkdown(message.text);
            activeAssistantMessage.scrollIntoView({ block: "end", behavior: "smooth" });
            activeAssistantMessage = undefined;
            activeAssistantRaw = "";
          } else {
            appendMessage("assistant", message.text);
          }
          lastTurnWasPlan = pendingTurnWasPlan;
          updatePlanModeUi();
        }

        if (message.type === "assistantMessageStart") {
          startAssistantMessage();
        }

        if (message.type === "assistantMessageDelta") {
          appendAssistantDelta(message.text);
        }

        if (message.type === "assistantMessageDone") {
          activeAssistantMessage = undefined;
          activeAssistantRaw = "";
          lastTurnWasPlan = pendingTurnWasPlan;
          updatePlanModeUi();
        }

        if (message.type === "userMessage") {
          appendMessage("user", message.text);
        }

        if (message.type === "error") {
          appendMessage("error", message.text);
        }

        if (message.type === "modelLabel") {
          modelLabel.textContent = message.text;
        }

        if (message.type === "busy") {
          const isBusy = Boolean(message.value);
          send.disabled = isBusy;
          textarea.disabled = isBusy;
          composerMenuToggle.disabled = isBusy;
          modelChip.disabled = isBusy;
        }
      });
    </script>
  </body>
</html>`;
}
