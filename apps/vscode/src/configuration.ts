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

import {
  DEFAULT_HUGGINGFACE_BASE_URL,
  DEFAULT_HUGGINGFACE_MODEL,
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  DEFAULT_SARVAM_BASE_URL,
  DEFAULT_SARVAM_MODEL,
  type ProviderFactoryOptions,
  type ProviderId,
} from "@codesetu/core";
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
      // The API key is intentionally NOT read from settings. It lives in the OS
      // secret store and is injected by the extension host (see secretStorage.ts).
      // The core provider falls back to env vars when apiKey is undefined.
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
    chatMaxTokens: configuration.get<number>("chat.maxTokens", 4096),
    chatTemperature: configuration.get<number>("chat.temperature", 0.2),
  };
}

export function summarizeCodeSetuConfiguration(
  secretApiKey?: string,
): CodeSetuConfigurationSummary {
  const configuration = readCodeSetuConfiguration();
  const provider = normalizeProvider(configuration.providerOptions.provider);

  if (provider === "huggingface") {
    return {
      provider,
      baseURL:
        firstConfigValue(
          configuration.providerOptions.baseURL,
          process.env.HF_BASE_URL,
          DEFAULT_HUGGINGFACE_BASE_URL,
        ) ?? DEFAULT_HUGGINGFACE_BASE_URL,
      model:
        firstConfigValue(
          configuration.providerOptions.model,
          process.env.HF_MODEL,
          DEFAULT_HUGGINGFACE_MODEL,
        ) ?? DEFAULT_HUGGINGFACE_MODEL,
      hasApiKey: hasConfigValue(secretApiKey, process.env.HF_TOKEN, process.env.CODESETU_API_KEY),
    };
  }

  if (provider === "sarvam") {
    return {
      provider,
      baseURL:
        firstConfigValue(
          configuration.providerOptions.baseURL,
          process.env.SARVAM_BASE_URL,
          process.env.CODESETU_BASE_URL,
          DEFAULT_SARVAM_BASE_URL,
        ) ?? DEFAULT_SARVAM_BASE_URL,
      model:
        firstConfigValue(
          configuration.providerOptions.model,
          process.env.SARVAM_MODEL,
          process.env.CODESETU_MODEL,
          DEFAULT_SARVAM_MODEL,
        ) ?? DEFAULT_SARVAM_MODEL,
      hasApiKey: hasConfigValue(
        secretApiKey,
        process.env.SARVAM_API_KEY,
        process.env.CODESETU_API_KEY,
      ),
    };
  }

  return {
    provider,
    baseURL:
      firstConfigValue(
        configuration.providerOptions.baseURL,
        process.env.CODESETU_BASE_URL,
        DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      ) ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
    model:
      firstConfigValue(
        configuration.providerOptions.model,
        process.env.CODESETU_MODEL,
        DEFAULT_OPENAI_COMPATIBLE_MODEL,
      ) ?? DEFAULT_OPENAI_COMPATIBLE_MODEL,
    hasApiKey: hasConfigValue(secretApiKey, process.env.CODESETU_API_KEY),
  };
}

function readProvider(configuration: vscode.WorkspaceConfiguration): ProviderId {
  return normalizeProvider(configuration.get<string>("provider", "sarvam"));
}

function normalizeProvider(provider: string | undefined): ProviderId {
  if (provider === "openai-compatible" || provider === "huggingface") {
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

function hasConfigValue(...values: Array<string | undefined>): boolean {
  return values.some((value) => value !== undefined && value.trim().length > 0);
}

function firstConfigValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}
