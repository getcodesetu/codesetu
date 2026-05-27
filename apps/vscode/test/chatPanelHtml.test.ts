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

import { describe, expect, it } from "vitest";

import { renderChatPanelHtml } from "../src/chatPanelHtml";

describe("renderChatPanelHtml", () => {
  it("renders the composer with the real configured model and the IDE-context toggle", () => {
    const html = renderChatPanelHtml({
      cspSource: "vscode-resource:",
      nonce: "test-nonce",
      modelLabel: "sarvam · sarvam-30b",
    });

    expect(html).toContain('class="composer-shell"');
    expect(html).toContain('id="composer-menu-toggle"');
    expect(html).toContain("Include IDE context");
    expect(html).toContain('id="include-context"');
    expect(html).toContain('class="model-chip"');
    expect(html).toContain("sarvam · sarvam-30b");
    expect(html).toContain('aria-label="Send message"');
  });

  it("does not advertise non-functional or fictional controls", () => {
    const html = renderChatPanelHtml({
      cspSource: "vscode-resource:",
      nonce: "test-nonce",
      modelLabel: "sarvam · sarvam-30b",
    });

    expect(html).not.toContain("Extra High");
    expect(html).not.toContain("GPT-5.5");
    expect(html).not.toContain("Work locally");
    expect(html).not.toContain("Default permissions");
    expect(html).not.toContain("Plan mode");
    expect(html).not.toContain('id="model-menu-toggle"');
    expect(html).not.toContain('id="plugins-menu-toggle"');
  });

  it("escapes the model label and renders assistant text through safe markdown", () => {
    const html = renderChatPanelHtml({
      cspSource: "vscode-resource:",
      nonce: "test-nonce",
      modelLabel: "<script>evil</script>",
    });

    expect(html).not.toContain("<script>evil</script>");
    expect(html).toContain("&lt;script&gt;evil&lt;/script&gt;");
    expect(html).toContain("function renderMarkdown");
    expect(html).toContain(".assistant pre");
  });

  it("uses the composer shell as the focus surface with real icon markup", () => {
    const html = renderChatPanelHtml({
      cspSource: "vscode-resource:",
      nonce: "test-nonce",
      modelLabel: "sarvam · sarvam-30b",
    });

    expect(html).toContain(".composer-shell:focus-within");
    expect(html).toContain("textarea:focus-visible");
    expect(html).toContain("outline: none;");
    expect(html).toContain('data-icon="plus"');
    expect(html).toContain('data-icon="send"');
  });
});
