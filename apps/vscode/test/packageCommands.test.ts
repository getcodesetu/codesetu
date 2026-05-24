/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
) as {
  contributes: {
    commands: Array<{ command: string; title: string }>;
  };
};

describe("VS Code command contributions", () => {
  it("contributes CodeSetu chat, setup, diagnostics, and editor actions", () => {
    const commands = packageJson.contributes.commands.map((command) => command.command);

    expect(commands).toEqual(
      expect.arrayContaining([
        "codesetu.openChat",
        "codesetu.setupProvider",
        "codesetu.diagnoseProvider",
        "codesetu.explainSelection",
        "codesetu.refactorSelection",
        "codesetu.writeTestsForSelection",
        "codesetu.fixBugInSelection",
        "codesetu.addDocsToSelection",
      ]),
    );
  });
});
