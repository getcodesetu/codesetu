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
  Auth,
  Collection,
  FolderNode,
  HttpRequest,
  RequestBody,
  RequestNode,
  RequestProtocol,
  RequestSettings,
  WebSocketRequest,
} from "./model.js";

/** Generates a collision-resistant id that works in Node and browser webviews. */
export function newId(): string {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultSettings(): RequestSettings {
  return {
    followRedirects: true,
    maxRedirects: 10,
    timeoutMs: 30_000,
    verifyTls: true,
    encodeUrl: true,
  };
}

export function createNoneAuth(): Auth {
  return { type: "none" };
}

export function createEmptyBody(): RequestBody {
  return { mode: "none" };
}

export function createDefaultHttpRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: "GET",
    url: "",
    queryParams: [],
    pathVariables: [],
    headers: [],
    body: createEmptyBody(),
    auth: createNoneAuth(),
    scripts: {},
    settings: createDefaultSettings(),
    ...overrides,
  };
}

export function createDefaultWebSocketRequest(
  overrides: Partial<WebSocketRequest> = {},
): WebSocketRequest {
  return {
    url: "",
    protocols: [],
    headers: [],
    auth: createNoneAuth(),
    savedMessages: [],
    ...overrides,
  };
}

export function createRequestNode(name: string, protocol: RequestProtocol = "http"): RequestNode {
  return {
    kind: "request",
    id: newId(),
    name,
    protocol,
    ...(protocol === "http"
      ? { http: createDefaultHttpRequest() }
      : { websocket: createDefaultWebSocketRequest() }),
  };
}

export function createFolderNode(name: string): FolderNode {
  return {
    kind: "folder",
    id: newId(),
    name,
    children: [],
  };
}

export function createCollection(name: string): Collection {
  return {
    id: newId(),
    name,
    variables: [],
    auth: createNoneAuth(),
    children: [],
  };
}
