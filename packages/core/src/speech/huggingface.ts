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

import { OpenAICompatibleSpeechProvider } from "./openaiCompatible.js";

/**
 * Hugging Face Inference Router (https://router.huggingface.co/v1) speaks the
 * OpenAI-compatible audio API for transcription. Coverage of
 * `/v1/audio/transcriptions` on the router is uneven across models — if you
 * get a 404, switch baseURL to a model-specific endpoint or use a dedicated
 * Inference Endpoint.
 */
export const DEFAULT_HUGGINGFACE_SPEECH_BASE_URL = "https://router.huggingface.co/v1";
export const DEFAULT_HUGGINGFACE_STT_MODEL = "openai/whisper-large-v3";

export interface HuggingFaceSpeechProviderOptions {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  defaultLanguage?: string;
  fetch?: typeof fetch;
}

export class HuggingFaceSpeechProvider extends OpenAICompatibleSpeechProvider {
  public constructor(options: HuggingFaceSpeechProviderOptions) {
    super({
      providerId: "huggingface",
      apiKey: options.apiKey,
      baseURL: options.baseURL ?? DEFAULT_HUGGINGFACE_SPEECH_BASE_URL,
      defaultModel: options.defaultModel ?? DEFAULT_HUGGINGFACE_STT_MODEL,
      ...(options.defaultLanguage === undefined
        ? {}
        : { defaultLanguage: options.defaultLanguage }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }
}
