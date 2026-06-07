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
  BUILTIN_SKILLS_FALLBACK,
  parseBuiltinSkills,
  type BuiltinSkill,
  type WorkspaceInstructionSource,
} from "@codesetu/core";
import * as vscode from "vscode";

/**
 * Load the built-in skills from the bundled `skills/<id>/SKILL.md` files (the
 * single source of truth, copied from repo root at build time — see
 * scripts/copy-skills.mjs). Falls back to BUILTIN_SKILLS_FALLBACK if the bundle
 * is missing or unparseable, so skills never silently vanish. Loaded once and
 * cached — the bundle doesn't change at runtime.
 */
let cached: readonly BuiltinSkill[] | undefined;

export async function loadBuiltinSkills(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
): Promise<readonly BuiltinSkill[]> {
  if (cached !== undefined) {
    return cached;
  }

  const skillsDir = vscode.Uri.joinPath(context.extensionUri, "skills");
  const sources: WorkspaceInstructionSource[] = [];

  try {
    const entries = await vscode.workspace.fs.readDirectory(skillsDir);
    for (const [name, fileType] of entries) {
      if (fileType !== vscode.FileType.Directory) {
        continue;
      }
      const fileUri = vscode.Uri.joinPath(skillsDir, name, "SKILL.md");
      try {
        const bytes = await vscode.workspace.fs.readFile(fileUri);
        sources.push({
          kind: "skill",
          path: `skills/${name}/SKILL.md`,
          content: Buffer.from(bytes).toString("utf8"),
        });
      } catch {
        // Directory without a SKILL.md — skip silently.
      }
    }
  } catch (error: unknown) {
    outputChannel.appendLine(
      `CodeSetu: could not read bundled skills (${formatError(error)}); using built-in defaults.`,
    );
    cached = BUILTIN_SKILLS_FALLBACK;
    return cached;
  }

  const { skills, warnings } = parseBuiltinSkills(sources);
  for (const warning of warnings) {
    outputChannel.appendLine(`CodeSetu skill warning: ${warning}`);
  }

  if (skills.length === 0) {
    outputChannel.appendLine(
      "CodeSetu: no built-in skills loaded from bundle; using built-in defaults.",
    );
    cached = BUILTIN_SKILLS_FALLBACK;
    return cached;
  }

  outputChannel.appendLine(`CodeSetu: loaded ${skills.length} built-in skill(s) from bundle.`);
  cached = skills;
  return cached;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
