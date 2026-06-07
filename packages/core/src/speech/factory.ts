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
  DEFAULT_HUGGINGFACE_SPEECH_BASE_URL,
  DEFAULT_HUGGINGFACE_STT_MODEL,
  HuggingFaceSpeechProvider,
} from "./huggingface.js";
import { OpenAICompatibleSpeechProvider } from "./openaiCompatible.js";
import {
  DEFAULT_SARVAM_LANGUAGE,
  DEFAULT_SARVAM_SPEECH_BASE_URL,
  DEFAULT_SARVAM_STT_MODEL,
  SarvamSpeechProvider,
} from "./sarvam.js";
import type { SpeechFactoryOptions, SpeechProvider, SpeechProviderId } from "./types.js";

/**
 * Normalize a possibly-stringly-typed provider id. Unknown values fall back to
 * `browser` since that's the safe local-only default — no key needed, no
 * network call (the webview owns the WebSpeech path).
 */
export function normalizeSpeechProvider(value: string | undefined): SpeechProviderId {
  switch (value) {
    case "sarvam":
    case "openai-compatible":
    case "huggingface":
      return value;
    default:
      return "browser";
  }
}

export interface CreateSpeechProviderResult {
  /** The host-side provider, or null for browser (the webview handles that). */
  provider: SpeechProvider | null;
  /** The id actually used (after normalization), so callers can echo it back. */
  providerId: SpeechProviderId;
}

/**
 * Build the host-side SpeechProvider for the configured backend, or signal
 * "no host-side provider needed" by returning `provider: null`. Throws if a
 * server-side backend was requested without an API key — surfacing the missing
 * config at construction time keeps the chat-side error path clean.
 */
export function createSpeechProvider(options: SpeechFactoryOptions): CreateSpeechProviderResult {
  const providerId = normalizeSpeechProvider(options.provider);

  if (providerId === "browser") {
    return { provider: null, providerId };
  }

  if (options.apiKey === undefined || options.apiKey.trim().length === 0) {
    throw new Error(
      `Speech provider "${providerId}" requires an API key. Run "CodeSetu: Setup Speech Provider".`,
    );
  }

  if (providerId === "sarvam") {
    return {
      providerId,
      provider: new SarvamSpeechProvider({
        apiKey: options.apiKey,
        baseURL: options.baseURL ?? DEFAULT_SARVAM_SPEECH_BASE_URL,
        defaultModel: options.model ?? DEFAULT_SARVAM_STT_MODEL,
        defaultLanguage: options.language ?? DEFAULT_SARVAM_LANGUAGE,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
    };
  }

  if (providerId === "huggingface") {
    return {
      providerId,
      provider: new HuggingFaceSpeechProvider({
        apiKey: options.apiKey,
        baseURL: options.baseURL ?? DEFAULT_HUGGINGFACE_SPEECH_BASE_URL,
        defaultModel: options.model ?? DEFAULT_HUGGINGFACE_STT_MODEL,
        ...(options.language === undefined ? {} : { defaultLanguage: options.language }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
    };
  }

  // openai-compatible: requires an explicit baseURL.
  if (options.baseURL === undefined || options.baseURL.trim().length === 0) {
    throw new Error('Speech provider "openai-compatible" requires a base URL pointing at /v1.');
  }
  return {
    providerId,
    provider: new OpenAICompatibleSpeechProvider({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
      ...(options.model === undefined ? {} : { defaultModel: options.model }),
      ...(options.language === undefined ? {} : { defaultLanguage: options.language }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    }),
  };
}
