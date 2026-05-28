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

import type {
  AudioBlob,
  SpeechProvider,
  SynthesizeOptions,
  TranscribeOptions,
  TranscriptionResult,
} from "./types.js";

export const DEFAULT_SARVAM_SPEECH_BASE_URL = "https://api.sarvam.ai";
export const DEFAULT_SARVAM_STT_MODEL = "saaras:v2";
export const DEFAULT_SARVAM_TTS_MODEL = "bulbul:v1";
export const DEFAULT_SARVAM_TTS_VOICE = "meera";
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

interface SarvamTtsResponse {
  audios?: string[];
}

/**
 * Sarvam Saaras (STT) + Bulbul (TTS) speech provider. Saaras posts multipart
 * form data to /speech-to-text; Bulbul posts JSON to /text-to-speech and
 * returns base64-encoded WAV. Keep the surface narrow — match the
 * SpeechProvider contract rather than every Sarvam-specific knob.
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
    formData.append("file", new Blob([new Uint8Array(audio.bytes)], { type: audio.mimeType }), "audio");
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

  public async synthesize(text: string, options: SynthesizeOptions = {}): Promise<AudioBlob> {
    const response = await this.fetchImpl(`${this.baseURL}/text-to-speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": this.apiKey,
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: options.language ?? this.defaultLanguage,
        model: options.model ?? this.defaultModel ?? DEFAULT_SARVAM_TTS_MODEL,
        speaker: options.voice ?? DEFAULT_SARVAM_TTS_VOICE,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sarvam TTS failed: ${response.status} ${await response.text()}`);
    }

    const json = (await response.json()) as SarvamTtsResponse;
    const base64 = json.audios?.[0];
    if (base64 === undefined) {
      throw new Error("Sarvam TTS returned no audio");
    }
    return { mimeType: "audio/wav", bytes: base64ToBytes(base64) };
  }
}

function base64ToBytes(base64: string): Uint8Array {
  // Node has Buffer; the webview path uses atob. Either is fine — the webview
  // never instantiates this class (it talks to a host that does).
  const buffer = Buffer.from(base64, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
