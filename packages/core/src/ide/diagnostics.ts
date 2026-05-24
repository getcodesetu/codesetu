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

import { DEFAULT_OPENAI_COMPATIBLE_PROVIDER } from "../providers/openaiCompatible.js";
import { DEFAULT_PROVIDER_ID, createProvider as createConfiguredProvider } from "../providers/registry.js";
import type { DiagnoseProviderOptions, ProviderDiagnostic } from "./types.js";

export async function diagnoseProvider(
  options: DiagnoseProviderOptions = {},
): Promise<ProviderDiagnostic> {
  const providerOptions = options.providerOptions ?? {};
  const missingConfig = getMissingConfigMessage(providerOptions);

  if (missingConfig !== undefined) {
    return {
      status: "missing-config",
      message: missingConfig,
    };
  }

  try {
    const createProvider = options.createProvider ?? createConfiguredProvider;
    const provider = createProvider(providerOptions);
    const startedAt = Date.now();

    await provider.chat({
      messages: [{ role: "user", content: "Reply with ok." }],
      maxTokens: 8,
      temperature: 0,
    });

    return {
      status: "ok",
      message: "Provider diagnostic chat completed.",
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Provider diagnostic failed.",
    };
  }
}

function getMissingConfigMessage(providerOptions: {
  provider?: string;
  apiKey?: string;
  model?: string;
}): string | undefined {
  const provider = providerOptions.provider ?? process.env.CODESETU_PROVIDER ?? DEFAULT_PROVIDER_ID;

  if (provider === DEFAULT_PROVIDER_ID) {
    if (!hasConfigValue(providerOptions.model, process.env.SARVAM_MODEL, process.env.CODESETU_MODEL)) {
      return "model is required before CodeSetu can create the provider.";
    }

    if (!hasConfigValue(providerOptions.apiKey, process.env.SARVAM_API_KEY, process.env.CODESETU_API_KEY)) {
      return "API key is required before CodeSetu can create the provider.";
    }
  }

  if (provider === DEFAULT_OPENAI_COMPATIBLE_PROVIDER) {
    if (!hasConfigValue(providerOptions.apiKey, process.env.CODESETU_API_KEY)) {
      return "API key is required before CodeSetu can create the provider.";
    }
  }

  return undefined;
}

function hasConfigValue(...values: Array<string | undefined>): boolean {
  return values.some((value) => value !== undefined && value.trim().length > 0);
}
