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

import { normalizeSpeechProvider, type SpeechProviderId } from "@codesetu/core";
import * as vscode from "vscode";

export interface SpeechConfiguration {
  sttProvider: SpeechProviderId;
  ttsProvider: SpeechProviderId;
  language: string;
  ttsEnabled: boolean;
  sttBaseUrl: string;
  sttModel: string;
  ttsBaseUrl: string;
  ttsModel: string;
}

export function readSpeechConfiguration(): SpeechConfiguration {
  const configuration = vscode.workspace.getConfiguration("codesetu.speech");
  return {
    sttProvider: normalizeSpeechProvider(configuration.get<string>("sttProvider", "browser")),
    ttsProvider: normalizeSpeechProvider(configuration.get<string>("ttsProvider", "browser")),
    language: (configuration.get<string>("language", "en-US") || "en-US").trim(),
    ttsEnabled: configuration.get<boolean>("ttsEnabled", false),
    sttBaseUrl: (configuration.get<string>("sttBaseUrl", "") || "").trim(),
    sttModel: (configuration.get<string>("sttModel", "") || "").trim(),
    ttsBaseUrl: (configuration.get<string>("ttsBaseUrl", "") || "").trim(),
    ttsModel: (configuration.get<string>("ttsModel", "") || "").trim(),
  };
}
