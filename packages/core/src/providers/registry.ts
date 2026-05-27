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

import { DEFAULT_HUGGINGFACE_PROVIDER, HuggingFaceProvider } from "./huggingface.js";
import {
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  DEFAULT_OPENAI_COMPATIBLE_PROVIDER,
  OpenAICompatibleProvider,
} from "./openaiCompatible.js";
import { SarvamProvider } from "./sarvam.js";

export const DEFAULT_PROVIDER_ID = "sarvam";

export type ProviderId =
  | typeof DEFAULT_PROVIDER_ID
  | typeof DEFAULT_OPENAI_COMPATIBLE_PROVIDER
  | typeof DEFAULT_HUGGINGFACE_PROVIDER;

export interface ProviderFactoryOptions {
  provider?: string;
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

export type ConfiguredProvider = SarvamProvider | OpenAICompatibleProvider | HuggingFaceProvider;

const providerIds = [
  DEFAULT_PROVIDER_ID,
  DEFAULT_OPENAI_COMPATIBLE_PROVIDER,
  DEFAULT_HUGGINGFACE_PROVIDER,
] as const;

export function listProviderIds(): ProviderId[] {
  return [...providerIds];
}

export function createProvider(options: ProviderFactoryOptions = {}): ConfiguredProvider {
  const provider = options.provider ?? process.env.CODESETU_PROVIDER ?? DEFAULT_PROVIDER_ID;

  if (provider === DEFAULT_PROVIDER_ID) {
    return new SarvamProvider(options);
  }

  if (provider === DEFAULT_OPENAI_COMPATIBLE_PROVIDER) {
    return new OpenAICompatibleProvider({
      providerId: DEFAULT_OPENAI_COMPATIBLE_PROVIDER,
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      defaultBaseURL: DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
      model: options.model,
      defaultModel: DEFAULT_OPENAI_COMPATIBLE_MODEL,
    });
  }

  if (provider === DEFAULT_HUGGINGFACE_PROVIDER) {
    return new HuggingFaceProvider({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      model: options.model,
    });
  }

  throw new Error(
    `Unsupported provider "${provider}". Supported providers: ${listProviderIds().join(", ")}.`,
  );
}
