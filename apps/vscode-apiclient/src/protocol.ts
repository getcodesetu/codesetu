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
  Collection,
  Environment,
  HttpResponse,
  RequestNode,
  Variable,
} from "@codesetu/api-client-core/model";

/** Persisted API Client state. Stored as JSON in the workspace or global storage. */
export interface PersistedState {
  collections: Collection[];
  environments: Environment[];
  globals: Variable[];
  activeEnvironmentId?: string;
  history: HistoryEntry[];
}

export interface HistoryEntry {
  id: string;
  at: number;
  method: string;
  url: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
}

export interface RequestDefaults {
  timeoutMs: number;
  followRedirects: boolean;
  maxRedirects: number;
  verifyTls: boolean;
}

export type ImportFormat = "postman" | "openapi" | "insomnia" | "har" | "curl" | "auto";

/** Messages sent from the webview to the extension host. */
export type WebviewToHost =
  | { type: "ready" }
  | { type: "sendHttpRequest"; requestId: string; node: RequestNode; environmentId?: string }
  | { type: "cancelRequest"; requestId: string }
  | { type: "persist"; state: PersistedState }
  | { type: "importText"; format: ImportFormat; text: string }
  | { type: "pickImportFile" };

/** Messages sent from the extension host to the webview. */
export type HostToWebview =
  | { type: "init"; state: PersistedState; defaults: RequestDefaults }
  | { type: "httpResponse"; requestId: string; response: HttpResponse }
  | { type: "httpError"; requestId: string; message: string }
  | { type: "importResult"; collections: Collection[] }
  | { type: "importError"; message: string }
  | { type: "notify"; level: "info" | "warn" | "error"; message: string };

export function emptyState(): PersistedState {
  return { collections: [], environments: [], globals: [], history: [] };
}
