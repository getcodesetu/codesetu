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
}

export function renderChatPanelHtml(options: RenderChatPanelHtmlOptions): string {
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
      }

      .user {
        background: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));
      }

      .assistant {
        background: var(--vscode-editor-inactiveSelectionBackground);
        border: 1px solid rgba(127, 127, 127, 0.08);
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
        min-height: 132px;
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

      .composer-toolbar,
      .toolbar-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .composer-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 12px;
        min-height: 36px;
      }

      .toolbar-group {
        min-width: 0;
      }

      .toolbar-group.secondary {
        justify-self: end;
      }

      button {
        font: inherit;
      }

      .icon-button,
      .pill-button,
      .send-button,
      .local-button,
      .menu-row,
      .menu-button {
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
      .pill-button:hover,
      .local-button:hover,
      .menu-row:hover,
      .menu-button:hover {
        background: var(--vscode-toolbar-hoverBackground);
      }

      .icon-button:focus-visible,
      .pill-button:focus-visible,
      .send-button:focus-visible,
      .local-button:focus-visible,
      .menu-row:focus-visible,
      .menu-button:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
      }

      textarea:focus-visible {
        outline: none;
      }

      .pill-button,
      .local-button {
        min-height: 34px;
        padding: 0 9px;
        border-radius: 9px;
      }

      .pill-button {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        color: var(--vscode-descriptionForeground);
        white-space: nowrap;
      }

      .pill-button strong {
        color: var(--vscode-foreground);
        font-weight: 500;
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
      .pill-button:disabled,
      .icon-button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      .local-button {
        justify-self: start;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 30px;
        padding-inline: 8px;
        color: var(--vscode-descriptionForeground);
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

      .chevron {
        width: 14px;
        height: 14px;
        opacity: 0.86;
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

      .plugins-menu {
        left: 254px;
        bottom: 56px;
        min-width: 220px;
      }

      .model-menu {
        right: 50px;
        bottom: 54px;
        min-width: 280px;
      }

      .menu-title {
        padding: 7px 10px;
        color: var(--vscode-descriptionForeground);
      }

      .menu-divider {
        height: 1px;
        margin: 6px 8px;
        background: var(--vscode-widget-border);
      }

      .menu-row,
      .menu-button {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 36px;
        padding: 7px 10px;
        border-radius: 8px;
        text-align: left;
      }

      .menu-row {
        justify-content: space-between;
        gap: 16px;
      }

      .menu-button {
        justify-content: space-between;
        gap: 12px;
      }

      .menu-row[aria-disabled="true"],
      .menu-button[aria-disabled="true"] {
        opacity: 0.52;
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

      .checkmark {
        color: var(--vscode-button-background);
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
          min-height: 136px;
          border-radius: 14px;
        }

        .composer-toolbar {
          display: flex;
          align-items: stretch;
          flex-direction: column;
        }

        .toolbar-group {
          justify-content: space-between;
        }

        .toolbar-group.secondary {
          justify-self: stretch;
        }

        .pill-button {
          min-width: 0;
        }

        .model-menu,
        .plugins-menu {
          left: 0;
          right: auto;
          bottom: 54px;
          width: min(100%, 300px);
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
              <button class="pill-button" type="button" aria-label="Permissions">
                <svg class="composer-icon" data-icon="permissions" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3v6" />
                  <path d="M8 7v6" />
                  <path d="M16 8v5" />
                  <path d="M5 11v5a7 7 0 0 0 14 0v-4" />
                </svg>
                <strong>Default permissions</strong>
                <svg class="composer-icon chevron" data-icon="chevron-down" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            </div>
            <div class="toolbar-group secondary">
              <button
                id="model-menu-toggle"
                class="pill-button"
                type="button"
                aria-label="Model and reasoning"
                aria-expanded="false"
              >
                <strong id="model-label">5.5&nbsp;&nbsp;Extra High</strong>
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
        <button id="local-mode" class="local-button" type="button">
          <svg class="composer-icon" data-icon="work-local" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5h16v11H4z" />
            <path d="M8 20h8" />
            <path d="M12 16v4" />
          </svg>
          <span>Work locally</span>
          <svg class="composer-icon chevron" data-icon="chevron-down" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <div id="composer-menu" class="menu composer-menu" hidden>
          <button class="menu-button" type="button" aria-disabled="true">
            <span class="menu-leading">
              <span class="menu-icon">
                <svg class="composer-icon" data-icon="paperclip" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m21 8-10 10a5 5 0 0 1-7-7L14 1a3 3 0 0 1 4 4L8 15a1 1 0 0 1-1-1L17 4" />
                </svg>
              </span>
              Add photos &amp; files
            </span>
          </button>
          <div class="menu-divider"></div>
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
          <label class="menu-row" aria-disabled="true">
            <span class="menu-leading">
              <span class="menu-icon">
                <svg class="composer-icon" data-icon="plan" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
              </span>
              Plan mode
            </span>
            <span class="switch">
              <input type="checkbox" disabled />
              <span class="switch-track"></span>
            </span>
          </label>
          <label class="menu-row" aria-disabled="true">
            <span class="menu-leading">
              <span class="menu-icon">
                <svg class="composer-icon" data-icon="target" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="8" />
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3" />
                  <path d="M22 12h-3" />
                </svg>
              </span>
              Pursue goal
            </span>
            <span class="switch">
              <input type="checkbox" disabled />
              <span class="switch-track"></span>
            </span>
          </label>
          <div class="menu-divider"></div>
          <button id="plugins-menu-toggle" class="menu-button" type="button" aria-expanded="false">
            <span class="menu-leading">
              <span class="menu-icon">
                <svg class="composer-icon" data-icon="plugins" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="7" cy="7" r="3" />
                  <circle cx="17" cy="7" r="3" />
                  <circle cx="7" cy="17" r="3" />
                  <circle cx="17" cy="17" r="3" />
                </svg>
              </span>
              Plugins
            </span>
            <svg class="composer-icon chevron" data-icon="chevron-right" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
        </div>
        <div id="plugins-menu" class="menu plugins-menu" hidden>
          <div class="menu-title">2 installed plugins</div>
          <button class="menu-button" type="button" aria-disabled="true">
            <span class="menu-leading"><span class="menu-icon">HF</span>Hugging Face</span>
          </button>
          <button class="menu-button" type="button" aria-disabled="true">
            <span class="menu-leading"><span class="menu-icon">SP</span>Superpowers</span>
          </button>
        </div>
        <div id="model-menu" class="menu model-menu" hidden>
          <div class="menu-title">Reasoning</div>
          <button class="menu-button reasoning-option" type="button" data-reasoning="Low">
            <span>Low</span>
          </button>
          <button class="menu-button reasoning-option" type="button" data-reasoning="Medium">
            <span>Medium</span>
          </button>
          <button class="menu-button reasoning-option" type="button" data-reasoning="High">
            <span>High</span>
          </button>
          <button class="menu-button reasoning-option" type="button" data-reasoning="Extra High">
            <span>Extra High</span>
            <span class="checkmark" aria-hidden="true">&#10003;</span>
          </button>
          <div class="menu-divider"></div>
          <button class="menu-button" type="button" aria-disabled="true">
            <span>GPT-5.5</span>
            <svg class="composer-icon chevron" data-icon="chevron-right" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
          <button class="menu-button" type="button" aria-disabled="true">
            <span>Speed</span>
            <svg class="composer-icon chevron" data-icon="chevron-right" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </button>
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
      const pluginsMenuToggle = document.getElementById("plugins-menu-toggle");
      const pluginsMenu = document.getElementById("plugins-menu");
      const modelMenuToggle = document.getElementById("model-menu-toggle");
      const modelMenu = document.getElementById("model-menu");
      const modelLabel = document.getElementById("model-label");
      const includeContext = document.getElementById("include-context");
      const reasoningOptions = [...document.querySelectorAll(".reasoning-option")];
      let activeAssistantMessage;

      function appendMessage(kind, text) {
        const message = document.createElement("article");
        message.className = "message " + kind;
        message.textContent = text;
        transcript.appendChild(message);
        message.scrollIntoView({ block: "end", behavior: "smooth" });
        return message;
      }

      function appendAssistantDelta(text) {
        if (!activeAssistantMessage) {
          activeAssistantMessage = appendMessage("assistant", "");
        }

        activeAssistantMessage.textContent += text;
        activeAssistantMessage.scrollIntoView({ block: "end", behavior: "smooth" });
      }

      function setMenuOpen(menu, toggle, isOpen) {
        menu.hidden = !isOpen;
        toggle.setAttribute("aria-expanded", String(isOpen));
      }

      function closeMenus() {
        setMenuOpen(composerMenu, composerMenuToggle, false);
        setMenuOpen(pluginsMenu, pluginsMenuToggle, false);
        setMenuOpen(modelMenu, modelMenuToggle, false);
      }

      composerMenuToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = composerMenu.hidden;
        closeMenus();
        setMenuOpen(composerMenu, composerMenuToggle, isOpen);
      });

      pluginsMenuToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        setMenuOpen(pluginsMenu, pluginsMenuToggle, pluginsMenu.hidden);
      });

      modelMenuToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = modelMenu.hidden;
        closeMenus();
        setMenuOpen(modelMenu, modelMenuToggle, isOpen);
      });

      document.addEventListener("click", (event) => {
        const target = event.target;

        if (!(target instanceof Element)) {
          return;
        }

        if (!target.closest(".menu") && !target.closest(".pill-button") && !target.closest(".icon-button")) {
          closeMenus();
        }
      });

      reasoningOptions.forEach((option) => {
        option.addEventListener("click", () => {
          const reasoning = option.dataset.reasoning;
          modelLabel.innerHTML = "5.5&nbsp;&nbsp;" + reasoning;
          reasoningOptions.forEach((candidate) => {
            const marker = candidate.querySelector(".checkmark");
            if (marker) {
              marker.remove();
            }
          });
          const marker = document.createElement("span");
          marker.className = "checkmark";
          marker.setAttribute("aria-hidden", "true");
          marker.textContent = "\\u2713";
          option.appendChild(marker);
          closeMenus();
        });
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = textarea.value.trim();

        if (text.length === 0) {
          return;
        }

        textarea.value = "";
        closeMenus();
        vscode.postMessage({
          type: "sendMessage",
          text,
          includeIdeContext: includeContext.checked,
        });
      });

      window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "assistantMessage") {
          if (activeAssistantMessage) {
            activeAssistantMessage.textContent = message.text;
            activeAssistantMessage.scrollIntoView({ block: "end", behavior: "smooth" });
            activeAssistantMessage = undefined;
          } else {
            appendMessage("assistant", message.text);
          }
        }

        if (message.type === "assistantMessageStart") {
          activeAssistantMessage = appendMessage("assistant", "");
        }

        if (message.type === "assistantMessageDelta") {
          appendAssistantDelta(message.text);
        }

        if (message.type === "assistantMessageDone") {
          activeAssistantMessage = undefined;
        }

        if (message.type === "userMessage") {
          appendMessage("user", message.text);
        }

        if (message.type === "error") {
          appendMessage("error", message.text);
        }

        if (message.type === "busy") {
          const isBusy = Boolean(message.value);
          send.disabled = isBusy;
          textarea.disabled = isBusy;
          composerMenuToggle.disabled = isBusy;
          modelMenuToggle.disabled = isBusy;
        }
      });
    </script>
  </body>
</html>`;
}
