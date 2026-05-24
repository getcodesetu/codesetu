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

import { buildEditorActionMessage } from "../src/actionMessages.js";

describe("buildEditorActionMessage", () => {
  it("keeps editor action chat messages concise and leaves context internal", () => {
    const message = buildEditorActionMessage("explain");

    expect(message).toBe("Explain the selected code and its role in the surrounding file.");
    expect(message).not.toContain("Active file excerpt");
    expect(message).not.toContain("Related snippets");
    expect(message).not.toContain("```");
  });
});
