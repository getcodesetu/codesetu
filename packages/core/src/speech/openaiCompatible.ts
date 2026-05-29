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
  SpeechProviderId,
  TranscribeOptions,
  TranscriptionResult,
} from "./types.js";

export interface OpenAICompatibleSpeechOptions {
  apiKey: string;
  baseURL: string;
  defaultModel?: string;
  defaultLanguage?: string;
  fetch?: typeof fetch;
  /** Override the reported id — used by HuggingFace which reuses this transport. */
  providerId?: SpeechProviderId;
}

interface TranscriptionResponse {
  text?: string;
  language?: string;
}

/**
 * OpenAI-compatible speech-to-text provider — POSTs multipart audio to
 * `${baseURL}/audio/transcriptions`. Works with OpenAI, Groq, local
 * whisper.cpp servers, and any other implementation of that endpoint.
 * Hugging Face's Inference Router is a thin wrapper around this transport.
 */
export class OpenAICompatibleSpeechProvider implements SpeechProvider {
  public readonly id: SpeechProviderId;

  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly defaultModel: string;
  private readonly defaultLanguage?: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: OpenAICompatibleSpeechOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new Error("OpenAI-compatible speech provider requires an API key.");
    }
    if (options.baseURL.trim().length === 0) {
      throw new Error("OpenAI-compatible speech provider requires a base URL.");
    }
    this.id = options.providerId ?? "openai-compatible";
    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL.replace(/\/+$/, "");
    this.defaultModel = options.defaultModel ?? "whisper-1";
    if (options.defaultLanguage !== undefined) {
      this.defaultLanguage = options.defaultLanguage;
    }
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
    formData.append("model", options.model ?? this.defaultModel);
    const language = options.language ?? this.defaultLanguage;
    if (language !== undefined) {
      // OpenAI expects ISO-639-1 ("en"); we accept BCP-47 ("en-US") and trim.
      formData.append("language", language.split("-")[0] ?? language);
    }

    const response = await this.fetchImpl(`${this.baseURL}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.status} ${await response.text()}`);
    }

    const json = (await response.json()) as TranscriptionResponse;
    const text = json.text ?? "";
    return json.language === undefined ? { text } : { text, language: json.language };
  }
}
