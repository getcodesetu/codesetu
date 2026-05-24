/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { createProvider, diagnoseProvider, type ProviderDiagnostic } from "@codesetu/core";
import type * as vscodeTypes from "vscode";

import type { CodeSetuConfigurationSummary } from "./configuration";

type VSCodeApi = typeof vscodeTypes;

export function formatProviderDiagnosticLines(
  summary: CodeSetuConfigurationSummary,
  result: ProviderDiagnostic,
): string[] {
  return [
    `Provider: ${summary.provider}`,
    `Base URL: ${summary.baseURL ?? result.baseURL ?? "(default)"}`,
    `Model: ${summary.model ?? result.model ?? "(not set)"}`,
    `API key configured: ${summary.hasApiKey || result.hasApiKey ? "yes" : "no"}`,
    `Diagnostic: ${result.status} - ${result.message}`,
    ...(result.latencyMs === undefined ? [] : [`Latency: ${result.latencyMs}ms`]),
  ];
}

export function formatChatProviderLine(summary: CodeSetuConfigurationSummary): string {
  return [
    `Chat request provider: ${summary.provider}`,
    `baseURL=${summary.baseURL ?? "(default)"}`,
    `model=${summary.model ?? "(not set)"}`,
    `apiKeyConfigured=${summary.hasApiKey ? "yes" : "no"}`,
  ].join("; ");
}

export async function runCodeSetuProviderDiagnostics(
  outputChannel: vscodeTypes.OutputChannel,
): Promise<void> {
  const vscode: VSCodeApi = await import("vscode");
  const { readCodeSetuConfiguration, summarizeCodeSetuConfiguration } =
    await import("./configuration");
  const configuration = readCodeSetuConfiguration();
  const summary = summarizeCodeSetuConfiguration();
  const result = await diagnoseProvider({
    providerOptions: configuration.providerOptions,
    createProvider: (providerOptions) => createProvider(providerOptions),
  });

  for (const line of formatProviderDiagnosticLines(summary, result)) {
    outputChannel.appendLine(line);
  }

  if (result.status === "ok") {
    void vscode.window.showInformationMessage(
      `CodeSetu provider connection succeeded in ${result.latencyMs ?? 0}ms.`,
    );
    return;
  }

  void vscode.window.showWarningMessage(`CodeSetu provider diagnostic: ${result.message}`);
}
