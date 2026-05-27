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

export const DEFAULT_SARVAM_BASE_URL = "https://api.sarvam.ai/v1";
export const DEFAULT_SARVAM_MODEL = "sarvam-30b";

export type SarvamOpenAIClient = OpenAICompatibleClient;

export interface SarvamProviderOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  client?: SarvamOpenAIClient;
}

export class SarvamProvider extends OpenAICompatibleProvider {
  public constructor(options: SarvamProviderOptions = {}) {
    super({
      providerId: "sarvam",
      apiKey: options.apiKey,
      apiKeyEnvVar: "SARVAM_API_KEY",
      baseURL: options.baseURL,
      baseURLEnvVar: "SARVAM_BASE_URL",
      defaultBaseURL: DEFAULT_SARVAM_BASE_URL,
      model: options.model,
      modelEnvVar: "SARVAM_MODEL",
      defaultModel: DEFAULT_SARVAM_MODEL,
      client: options.client,
    });
  }
}
