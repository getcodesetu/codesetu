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

export type {
  AudioBlob,
  SpeechFactoryOptions,
  SpeechProvider,
  SpeechProviderId,
  TranscribeOptions,
  TranscriptionResult,
} from "./types.js";
export { SPEECH_PROVIDER_IDS } from "./types.js";
export {
  DEFAULT_SARVAM_LANGUAGE,
  DEFAULT_SARVAM_SPEECH_BASE_URL,
  DEFAULT_SARVAM_STT_MODEL,
  SarvamSpeechProvider,
  type SarvamSpeechProviderOptions,
} from "./sarvam.js";
export {
  OpenAICompatibleSpeechProvider,
  type OpenAICompatibleSpeechOptions,
} from "./openaiCompatible.js";
export {
  DEFAULT_HUGGINGFACE_SPEECH_BASE_URL,
  DEFAULT_HUGGINGFACE_STT_MODEL,
  HuggingFaceSpeechProvider,
  type HuggingFaceSpeechProviderOptions,
} from "./huggingface.js";
export {
  createSpeechProvider,
  normalizeSpeechProvider,
  type CreateSpeechProviderResult,
} from "./factory.js";
