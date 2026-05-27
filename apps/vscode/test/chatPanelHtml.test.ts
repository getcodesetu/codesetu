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
  it("renders the polished composer controls", () => {
    const html = renderChatPanelHtml({
      cspSource: "vscode-resource:",
      nonce: "test-nonce",
    });

    expect(html).toContain('class="composer-shell"');
    expect(html).toContain('id="composer-menu-toggle"');
    expect(html).toContain("Include IDE context");
    expect(html).toContain('id="include-context"');
    expect(html).toContain('id="model-menu-toggle"');
    expect(html).toContain("Extra High");
    expect(html).toContain("Work locally");
    expect(html).toContain('aria-label="Send message"');
  });

  it("uses the composer shell as the focus surface with real icon markup", () => {
    const html = renderChatPanelHtml({
      cspSource: "vscode-resource:",
      nonce: "test-nonce",
    });

    expect(html).toContain(".composer-shell:focus-within");
    expect(html).toContain("textarea:focus-visible");
    expect(html).toContain("outline: none;");
    expect(html).toContain('data-icon="plus"');
    expect(html).toContain('data-icon="send"');
    expect(html).toContain('data-icon="chevron-down"');
    expect(html).not.toContain('<span aria-hidden="true">o</span>');
    expect(html).not.toContain('<span aria-hidden="true">[]</span>');
  });
});
