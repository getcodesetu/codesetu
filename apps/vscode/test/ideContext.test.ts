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

import { buildEditorContext } from "../src/ideContext.js";

describe("buildEditorContext", () => {
  it("preserves selected text and bounded cursor context", () => {
    const context = buildEditorContext({
      activeFilePath: "src/example.ts",
      languageId: "typescript",
      text: "const before = true;\nfunction add(a: number, b: number) {\n  return a + b;\n}\nconst after = true;\n",
      selectionStart: 21,
      selectionEnd: 78,
      maxActiveFileChars: 50,
      maxCursorChars: 20,
    });

    expect(context.activeFilePath).toBe("src/example.ts");
    expect(context.selectedText).toContain("function add");
    expect(context.cursorPrefix?.length).toBeLessThanOrEqual(20);
    expect(context.cursorSuffix?.length).toBeLessThanOrEqual(20);
    expect(context.activeFileText?.length).toBeLessThanOrEqual(50);
  });
});
