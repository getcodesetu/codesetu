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

/**
 * The five voice backends users can choose between. `browser` and `local` both
 * run inside the webview (WebSpeech API + speechSynthesis) and do not touch the
 * host-side factory — the factory returns `null` for them. `local` is the
 * air-gapped variant: same code path as `browser`, surfaced as a separate
 * option so users can opt out of any future server-side fallback.
 */
export type SpeechProviderId = "browser" | "local" | "sarvam" | "openai-compatible" | "huggingface";

export const SPEECH_PROVIDER_IDS: readonly SpeechProviderId[] = [
  "browser",
  "local",
  "sarvam",
  "openai-compatible",
  "huggingface",
];

export interface AudioBlob {
  /** MIME type of the audio, e.g. "audio/webm", "audio/wav", "audio/mpeg". */
  mimeType: string;
  bytes: Uint8Array;
}

export interface TranscribeOptions {
  /** BCP-47 language hint, e.g. "en-US", "hi-IN". */
  language?: string;
  /** Optional model override (provider-dependent). */
  model?: string;
}

export interface SynthesizeOptions {
  /** BCP-47 language code or provider-specific locale. */
  language?: string;
  /** Optional voice id (provider-dependent — e.g. Sarvam "meera", OpenAI "alloy"). */
  voice?: string;
  /** Optional model override. */
  model?: string;
}

export interface TranscriptionResult {
  text: string;
  /** Provider-reported language if available. */
  language?: string;
}

/**
 * Server-side speech provider contract. Implementations may throw if a method
 * is unsupported (e.g. a transcription-only endpoint). Both methods are
 * optional so providers can implement only what they support.
 */
export interface SpeechProvider {
  readonly id: SpeechProviderId;
  transcribe?(audio: AudioBlob, options?: TranscribeOptions): Promise<TranscriptionResult>;
  synthesize?(text: string, options?: SynthesizeOptions): Promise<AudioBlob>;
}

export interface SpeechFactoryOptions {
  provider?: SpeechProviderId;
  apiKey?: string;
  baseURL?: string;
  /** Default model used when an individual call does not specify one. */
  model?: string;
  /** Default language used when an individual call does not specify one. */
  language?: string;
  /**
   * Injection seam for tests. When set, the provider uses this instead of
   * `globalThis.fetch`. Matches Node's fetch type.
   */
  fetch?: typeof fetch;
}
