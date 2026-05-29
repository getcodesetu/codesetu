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

import type { AudioBlob, SpeechProvider, TranscribeOptions, TranscriptionResult } from "./types.js";

export const DEFAULT_SARVAM_SPEECH_BASE_URL = "https://api.sarvam.ai";
// Sarvam ships STT under multiple model names ("saaras", "saarika"). saarika:v2
// is the current GA model — verify against your Sarvam dashboard if calls 404
// or 400 with "unknown model". See apps/jetbrains/README.md "Voice" section.
export const DEFAULT_SARVAM_STT_MODEL = "saarika:v2";
export const DEFAULT_SARVAM_LANGUAGE = "en-IN";

export interface SarvamSpeechProviderOptions {
  apiKey: string;
  baseURL?: string;
  defaultModel?: string;
  defaultLanguage?: string;
  fetch?: typeof fetch;
}

interface SarvamTranscribeResponse {
  transcript?: string;
  language_code?: string;
}

/**
 * Sarvam Saarika (STT) provider. POSTs multipart form data to /speech-to-text.
 * Auth via the `api-subscription-key` header (NOT a Bearer token — Sarvam
 * uses its own scheme). Response is JSON with `transcript` and an optional
 * `language_code`. Both field names are kept loose so a Sarvam-side rename
 * doesn't break us silently.
 */
export class SarvamSpeechProvider implements SpeechProvider {
  public readonly id = "sarvam" as const;

  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly defaultModel?: string;
  private readonly defaultLanguage: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: SarvamSpeechProviderOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new Error("Sarvam speech provider requires an API key.");
    }
    this.apiKey = options.apiKey;
    this.baseURL = (options.baseURL ?? DEFAULT_SARVAM_SPEECH_BASE_URL).replace(/\/+$/, "");
    if (options.defaultModel !== undefined) {
      this.defaultModel = options.defaultModel;
    }
    this.defaultLanguage = options.defaultLanguage ?? DEFAULT_SARVAM_LANGUAGE;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  public async transcribe(
    audio: AudioBlob,
    options: TranscribeOptions = {},
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType }),
      "audio",
    );
    formData.append("model", options.model ?? this.defaultModel ?? DEFAULT_SARVAM_STT_MODEL);
    formData.append("language_code", options.language ?? this.defaultLanguage);

    const response = await this.fetchImpl(`${this.baseURL}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": this.apiKey },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Sarvam STT failed: ${response.status} ${await response.text()}`);
    }

    const json = (await response.json()) as SarvamTranscribeResponse;
    const text = json.transcript ?? "";
    return json.language_code === undefined ? { text } : { text, language: json.language_code };
  }
}
