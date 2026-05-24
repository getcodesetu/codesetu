/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import {
  parseWorkspaceInstructions,
  type WorkspaceInstructionParseResult,
  type WorkspaceInstructionSource,
} from "@codesetu/core";
import * as vscode from "vscode";

export async function loadWorkspaceInstructions(
  outputChannel: vscode.OutputChannel,
): Promise<WorkspaceInstructionParseResult> {
  const skillFiles = await vscode.workspace.findFiles(".codesetu/skills/*.md", undefined, 50);
  const checkFiles = await vscode.workspace.findFiles(".codesetu/checks/*.md", undefined, 50);
  const sources: WorkspaceInstructionSource[] = [];

  for (const file of skillFiles) {
    sources.push({
      kind: "skill",
      path: vscode.workspace.asRelativePath(file, false),
      content: Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8"),
    });
  }

  for (const file of checkFiles) {
    sources.push({
      kind: "check",
      path: vscode.workspace.asRelativePath(file, false),
      content: Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8"),
    });
  }

  const result = parseWorkspaceInstructions(sources);

  for (const warning of result.warnings) {
    outputChannel.appendLine(`Workspace instruction warning: ${warning}`);
  }

  return result;
}
