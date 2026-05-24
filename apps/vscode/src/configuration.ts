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

import type { ProviderFactoryOptions, ProviderId } from "@codesetu/core";
import * as vscode from "vscode";

export interface CodeSetuConfiguration {
  providerOptions: ProviderFactoryOptions;
  inlineCompletionsEnabled: boolean;
  fimMaxTokens: number;
  fimTemperature: number;
  fimMaxPrefixChars: number;
  fimMaxSuffixChars: number;
  fimStopSequences: string[];
  chatMaxTokens: number;
  chatTemperature: number;
}

export interface CodeSetuConfigurationSummary {
  provider: ProviderId;
  baseURL?: string;
  model?: string;
  hasApiKey: boolean;
}

export function readCodeSetuConfiguration(): CodeSetuConfiguration {
  const configuration = vscode.workspace.getConfiguration("codesetu");

  return {
    providerOptions: {
      provider: readProvider(configuration),
      apiKey: readOptionalString(configuration, "apiKey"),
      baseURL: readOptionalString(configuration, "baseUrl"),
      model: readOptionalString(configuration, "model"),
    },
    inlineCompletionsEnabled: configuration.get<boolean>("inlineCompletions.enabled", true),
    fimMaxTokens: configuration.get<number>("inlineCompletions.maxTokens", 96),
    fimTemperature: configuration.get<number>("inlineCompletions.temperature", 0.1),
    fimMaxPrefixChars: configuration.get<number>("inlineCompletions.maxPrefixChars", 4000),
    fimMaxSuffixChars: configuration.get<number>("inlineCompletions.maxSuffixChars", 2000),
    fimStopSequences: configuration.get<string[]>("inlineCompletions.stopSequences", [
      "\n\n",
      "\n```",
    ]),
    chatMaxTokens: configuration.get<number>("chat.maxTokens", 1024),
    chatTemperature: configuration.get<number>("chat.temperature", 0.2),
  };
}

export function summarizeCodeSetuConfiguration(): CodeSetuConfigurationSummary {
  const configuration = readCodeSetuConfiguration();

  return {
    provider:
      configuration.providerOptions.provider === "openai-compatible"
        ? "openai-compatible"
        : "sarvam",
    baseURL: configuration.providerOptions.baseURL,
    model: configuration.providerOptions.model,
    hasApiKey: (configuration.providerOptions.apiKey ?? "").trim().length > 0,
  };
}

function readProvider(configuration: vscode.WorkspaceConfiguration): ProviderId {
  const provider = configuration.get<string>("provider", "sarvam");

  if (provider === "openai-compatible") {
    return provider;
  }

  return "sarvam";
}

function readOptionalString(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
): string | undefined {
  const value = configuration.get<string>(key, "").trim();

  return value.length === 0 ? undefined : value;
}
