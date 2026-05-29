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
 * Speech-to-text backends users can choose between. `browser` runs inside the
 * webview (WebSpeech API) and does not touch the host-side factory — the
 * factory returns `null` for it. All others are server-side and run in the
 * extension host.
 */
export type SpeechProviderId = "browser" | "sarvam" | "openai-compatible" | "huggingface";

export const SPEECH_PROVIDER_IDS: readonly SpeechProviderId[] = [
  "browser",
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

export interface TranscriptionResult {
  text: string;
  /** Provider-reported language if available. */
  language?: string;
}

/** Server-side speech-to-text provider contract. */
export interface SpeechProvider {
  readonly id: SpeechProviderId;
  transcribe(audio: AudioBlob, options?: TranscribeOptions): Promise<TranscriptionResult>;
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
