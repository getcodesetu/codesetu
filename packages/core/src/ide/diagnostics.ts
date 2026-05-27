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
  DEFAULT_HUGGINGFACE_PROVIDER,
} from "../providers/huggingface.js";
import {
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  DEFAULT_OPENAI_COMPATIBLE_PROVIDER,
} from "../providers/openaiCompatible.js";
import {
  DEFAULT_PROVIDER_ID,
  createProvider as createConfiguredProvider,
} from "../providers/registry.js";
import { DEFAULT_SARVAM_BASE_URL, DEFAULT_SARVAM_MODEL } from "../providers/sarvam.js";
import type { DiagnoseProviderOptions, ProviderDiagnostic } from "./types.js";

export async function diagnoseProvider(
  options: DiagnoseProviderOptions = {},
): Promise<ProviderDiagnostic> {
  const providerOptions = options.providerOptions ?? {};
  const metadata = resolveDiagnosticMetadata(providerOptions);
  const missingConfig = getMissingConfigMessage(metadata);

  if (missingConfig !== undefined) {
    return {
      ...metadata,
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
      ...metadata,
      status: "ok",
      message: "Provider diagnostic chat completed.",
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...metadata,
      status: "error",
      message: error instanceof Error ? error.message : "Provider diagnostic failed.",
    };
  }
}

interface DiagnosticMetadata {
  provider: string;
  baseURL: string;
  model: string;
  hasApiKey: boolean;
}

function resolveDiagnosticMetadata(providerOptions: {
  provider?: string;
  baseURL?: string;
  apiKey?: string;
  model?: string;
}): DiagnosticMetadata {
  const provider = providerOptions.provider ?? process.env.CODESETU_PROVIDER ?? DEFAULT_PROVIDER_ID;

  if (provider === DEFAULT_PROVIDER_ID) {
    return {
      provider,
      baseURL:
        firstConfigValue(
          providerOptions.baseURL,
          process.env.SARVAM_BASE_URL,
          process.env.CODESETU_BASE_URL,
          DEFAULT_SARVAM_BASE_URL,
        ) ?? DEFAULT_SARVAM_BASE_URL,
      model: resolveModel(
        providerOptions.model,
        process.env.SARVAM_MODEL,
        process.env.CODESETU_MODEL,
        DEFAULT_SARVAM_MODEL,
      ),
      hasApiKey: hasConfigValue(
        providerOptions.apiKey,
        process.env.SARVAM_API_KEY,
        process.env.CODESETU_API_KEY,
      ),
    };
  }

  if (provider === DEFAULT_OPENAI_COMPATIBLE_PROVIDER) {
    return {
      provider,
      baseURL:
        firstConfigValue(
          providerOptions.baseURL,
          process.env.CODESETU_BASE_URL,
          DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
        ) ?? DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      model: resolveModel(
        providerOptions.model,
        process.env.CODESETU_MODEL,
        DEFAULT_OPENAI_COMPATIBLE_MODEL,
      ),
      hasApiKey: hasConfigValue(providerOptions.apiKey, process.env.CODESETU_API_KEY),
    };
  }

  if (provider === DEFAULT_HUGGINGFACE_PROVIDER) {
    return {
      provider,
      baseURL:
        firstConfigValue(
          providerOptions.baseURL,
          process.env.HF_BASE_URL,
          DEFAULT_HUGGINGFACE_BASE_URL,
        ) ?? DEFAULT_HUGGINGFACE_BASE_URL,
      model: resolveModel(providerOptions.model, process.env.HF_MODEL, DEFAULT_HUGGINGFACE_MODEL),
      hasApiKey: hasConfigValue(
        providerOptions.apiKey,
        process.env.HF_TOKEN,
        process.env.CODESETU_API_KEY,
      ),
    };
  }

  return {
    provider,
    baseURL: firstConfigValue(providerOptions.baseURL, process.env.CODESETU_BASE_URL) ?? "",
    model: resolveModel(providerOptions.model, process.env.CODESETU_MODEL, ""),
    hasApiKey: hasConfigValue(providerOptions.apiKey, process.env.CODESETU_API_KEY),
  };
}

function getMissingConfigMessage(metadata: DiagnosticMetadata): string | undefined {
  const { provider } = metadata;

  if (provider === DEFAULT_PROVIDER_ID) {
    if (!hasConfigValue(metadata.model)) {
      return "model is required before CodeSetu can create the provider.";
    }

    if (!metadata.hasApiKey) {
      return "API key is required before CodeSetu can create the provider.";
    }
  }

  if (provider === DEFAULT_OPENAI_COMPATIBLE_PROVIDER) {
    if (!metadata.hasApiKey) {
      return "API key is required before CodeSetu can create the provider.";
    }
  }

  if (provider === DEFAULT_HUGGINGFACE_PROVIDER) {
    if (!metadata.hasApiKey) {
      return "A Hugging Face token is required before CodeSetu can create the provider.";
    }
  }

  return undefined;
}

function hasConfigValue(...values: Array<string | undefined>): boolean {
  return values.some((value) => value !== undefined && value.trim().length > 0);
}

function resolveModel(
  explicitModel: string | undefined,
  ...fallbacks: Array<string | undefined>
): string {
  if (explicitModel !== undefined) {
    return explicitModel.trim();
  }

  return firstConfigValue(...fallbacks) ?? "";
}

function firstConfigValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}
