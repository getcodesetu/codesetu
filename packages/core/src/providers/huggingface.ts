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

import { OpenAICompatibleProvider, type OpenAICompatibleClient } from "./openaiCompatible.js";

export const DEFAULT_HUGGINGFACE_PROVIDER = "huggingface";
// Hugging Face Inference Providers expose an OpenAI-compatible router. Users can
// also point this at a dedicated Inference Endpoint or a self-hosted TGI server
// by overriding the base URL.
export const DEFAULT_HUGGINGFACE_BASE_URL = "https://router.huggingface.co/v1";
export const DEFAULT_HUGGINGFACE_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

export type HuggingFaceOpenAIClient = OpenAICompatibleClient;

export interface HuggingFaceProviderOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  client?: HuggingFaceOpenAIClient;
}

export class HuggingFaceProvider extends OpenAICompatibleProvider {
  public constructor(options: HuggingFaceProviderOptions = {}) {
    super({
      providerId: DEFAULT_HUGGINGFACE_PROVIDER,
      apiKey: options.apiKey,
      apiKeyEnvVar: "HF_TOKEN",
      baseURL: options.baseURL,
      baseURLEnvVar: "HF_BASE_URL",
      defaultBaseURL: DEFAULT_HUGGINGFACE_BASE_URL,
      model: options.model,
      modelEnvVar: "HF_MODEL",
      defaultModel: DEFAULT_HUGGINGFACE_MODEL,
      client: options.client,
    });
  }
}
