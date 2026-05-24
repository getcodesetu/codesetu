/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, expect, it } from "vitest";

import { buildEditorActionMessage, buildEditorActionRequest } from "../src/actionMessages.js";

describe("buildEditorActionMessage", () => {
  it("keeps editor action chat messages concise and leaves context internal", () => {
    const message = buildEditorActionMessage("explain");

    expect(message).toBe("Explain the selected code and its role in the surrounding file.");
    expect(message).not.toContain("Active file excerpt");
    expect(message).not.toContain("Related snippets");
    expect(message).not.toContain("```");
  });

  it("keeps captured IDE context attached to editor action requests", () => {
    const request = buildEditorActionRequest("refactor", {
      activeFilePath: "src/service.ts",
      languageId: "typescript",
      selectedText: "const value = oldName;",
    });

    expect(request.text).toBe("Refactor the selected code while preserving behavior.");
    expect(request.text).not.toContain("const value");
    expect(request.ideContext.selectedText).toBe("const value = oldName;");
  });
});
