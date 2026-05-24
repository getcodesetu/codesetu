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

import type { IdeContextPayload } from "./types.js";

export interface IdeContextMarkdownOptions {
  maxActiveFileChars?: number;
  maxSnippetChars?: number;
  maxCursorChars?: number;
}

const DEFAULT_ACTIVE_FILE_CHARS = 4_000;
const DEFAULT_SNIPPET_CHARS = 1_500;
const DEFAULT_CURSOR_CHARS = 800;

export function trimMiddle(value: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }

  if (value.length <= maxChars) {
    return value;
  }

  const marker = "\n...[trimmed]...\n";
  if (maxChars <= marker.length) {
    return value.slice(0, maxChars);
  }

  const available = maxChars - marker.length;
  const prefixLength = Math.ceil(available / 2);
  const suffixLength = Math.floor(available / 2);

  return `${value.slice(0, prefixLength)}${marker}${value.slice(value.length - suffixLength)}`;
}

export function buildContextMarkdown(
  context: IdeContextPayload,
  options: IdeContextMarkdownOptions = {},
): string {
  const activeFilePath = context.activeFilePath ?? "untitled";
  const languageId = context.languageId ?? "plaintext";
  const maxActiveFileChars = options.maxActiveFileChars ?? DEFAULT_ACTIVE_FILE_CHARS;
  const maxSnippetChars = options.maxSnippetChars ?? DEFAULT_SNIPPET_CHARS;
  const maxCursorChars = options.maxCursorChars ?? DEFAULT_CURSOR_CHARS;

  const sections = [`Active file: ${activeFilePath}`, `Language: ${languageId}`];

  if (context.selectedText !== undefined && context.selectedText.length > 0) {
    sections.push(
      [
        `Selected code from ${activeFilePath}`,
        codeFence(languageId, context.selectedText),
      ].join("\n"),
    );
  }

  if (context.activeFileText !== undefined && context.activeFileText.length > 0) {
    sections.push(
      [
        "Active file excerpt",
        codeFence(languageId, trimMiddle(context.activeFileText, maxActiveFileChars)),
      ].join("\n"),
    );
  }

  if (
    (context.cursorPrefix !== undefined && context.cursorPrefix.length > 0) ||
    (context.cursorSuffix !== undefined && context.cursorSuffix.length > 0)
  ) {
    const prefix = trimMiddle(context.cursorPrefix ?? "", maxCursorChars);
    const suffix = trimMiddle(context.cursorSuffix ?? "", maxCursorChars);

    sections.push(
      [
        "Cursor neighborhood",
        codeFence(languageId, `${prefix}<cursor>${suffix}`),
      ].join("\n"),
    );
  }

  if (context.relatedSnippets !== undefined && context.relatedSnippets.length > 0) {
    const snippets = context.relatedSnippets.map((snippet) =>
      [
        `Related snippet: ${snippet.path}`,
        codeFence(snippet.languageId ?? "plaintext", trimMiddle(snippet.text, maxSnippetChars)),
      ].join("\n"),
    );

    sections.push(["Related snippets", ...snippets].join("\n\n"));
  }

  return sections.join("\n\n");
}

function codeFence(languageId: string, text: string): string {
  return `\`\`\`${languageId}\n${text}\n\`\`\``;
}
