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

import type { LlmProvider } from "@codesetu/core";
import * as vscode from "vscode";

import { delayUnlessCancelled } from "./completionDebounce";
import type { CodeSetuConfiguration } from "./configuration";
import { buildFimContext } from "./fimContext";

export interface CodeSetuInlineCompletionProviderOptions {
  createProvider(): LlmProvider;
  getConfiguration(): CodeSetuConfiguration;
  outputChannel: vscode.OutputChannel;
}

interface CompletionCacheEntry {
  prompt: string;
  suffix: string;
  text: string;
}

export class CodeSetuInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  // Single-entry cache so VS Code re-triggering at the same spot (it asks again
  // after the user types through the ghost text, on focus, etc.) reuses the last
  // result instead of firing another model request.
  private lastCompletion: CompletionCacheEntry | undefined;

  public constructor(private readonly options: CodeSetuInlineCompletionProviderOptions) {}

  public async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    inlineContext: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
    void inlineContext;

    if (token.isCancellationRequested) {
      return undefined;
    }

    const configuration = this.options.getConfiguration();

    if (!configuration.inlineCompletionsEnabled) {
      return [];
    }

    const fimContext = buildFimContext({
      text: document.getText(),
      offset: document.offsetAt(position),
      maxPrefixChars: configuration.fimMaxPrefixChars,
      maxSuffixChars: configuration.fimMaxSuffixChars,
    });

    if (fimContext.prompt.length === 0 && fimContext.suffix.length === 0) {
      return [];
    }

    // Serve an identical re-request from cache without a network round-trip.
    const cached = this.lastCompletion;
    if (
      cached !== undefined &&
      cached.prompt === fimContext.prompt &&
      cached.suffix === fimContext.suffix
    ) {
      return [new vscode.InlineCompletionItem(cached.text, new vscode.Range(position, position))];
    }

    // Debounce: hold briefly so a burst of keystrokes only fires one request.
    // VS Code cancels the token when a newer request supersedes this one, so we
    // bail out the moment that happens rather than spending a model call.
    if (!(await delayUnlessCancelled(configuration.fimDebounceMs, token))) {
      return undefined;
    }

    try {
      const completion = await this.options.createProvider().completeFim({
        prompt: fimContext.prompt,
        suffix: fimContext.suffix,
        maxTokens: configuration.fimMaxTokens,
        temperature: configuration.fimTemperature,
        stop: configuration.fimStopSequences,
      });

      if (token.isCancellationRequested) {
        return undefined;
      }

      const text = completion.choices[0]?.text ?? "";

      if (text.length === 0) {
        return [];
      }

      this.lastCompletion = { prompt: fimContext.prompt, suffix: fimContext.suffix, text };

      return [new vscode.InlineCompletionItem(text, new vscode.Range(position, position))];
    } catch (error: unknown) {
      this.options.outputChannel.appendLine(
        `Inline completion failed: ${formatErrorMessage(error)}`,
      );
      return [];
    }
  }
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
