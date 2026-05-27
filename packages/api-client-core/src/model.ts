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
 * Shared API Client data model.
 *
 * This module is the single source of truth for the request/collection/response
 * shapes. The VSCode extension consumes it directly; the JetBrains plugin mirrors
 * the same shapes in Kotlin. Keep both in sync when changing this file.
 */

/** Enabled-by-default key/value entry used for params, headers, and form fields. */
export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
}

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | (string & Record<never, never>);

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export type BodyMode = "none" | "raw" | "form-data" | "urlencoded" | "binary" | "graphql";

export type RawLanguage = "json" | "text" | "xml" | "html" | "javascript";

export interface FormDataField {
  key: string;
  /** "text" sends a string field; "file" attaches the file at filePath. */
  kind: "text" | "file";
  value?: string;
  filePath?: string;
  contentType?: string;
  enabled: boolean;
  description?: string;
}

export interface GraphQlBody {
  query: string;
  /** JSON-encoded variables object. */
  variables?: string;
}

export interface RequestBody {
  mode: BodyMode;
  raw?: string;
  rawLanguage?: RawLanguage;
  formData?: FormDataField[];
  urlencoded?: KeyValue[];
  binaryFilePath?: string;
  graphql?: GraphQlBody;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export type AuthType = "none" | "inherit" | "bearer" | "basic" | "apikey" | "oauth2";

export type ApiKeyLocation = "header" | "query";

export interface BasicAuth {
  username: string;
  password: string;
}

export interface BearerAuth {
  token: string;
}

export interface ApiKeyAuth {
  key: string;
  value: string;
  location: ApiKeyLocation;
}

export type OAuth2GrantType =
  | "authorization_code"
  | "client_credentials"
  | "password"
  | "implicit";

export interface OAuth2Auth {
  grantType: OAuth2GrantType;
  accessToken?: string;
  refreshToken?: string;
  tokenUrl?: string;
  authUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  username?: string;
  password?: string;
  /** Header prefix for the access token. Defaults to "Bearer". */
  headerPrefix?: string;
}

export interface Auth {
  type: AuthType;
  basic?: BasicAuth;
  bearer?: BearerAuth;
  apikey?: ApiKeyAuth;
  oauth2?: OAuth2Auth;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface RequestScripts {
  preRequest?: string;
  test?: string;
}

export interface RequestSettings {
  followRedirects: boolean;
  maxRedirects: number;
  timeoutMs: number;
  /** TLS certificate verification. Disable only for trusted dev endpoints. */
  verifyTls: boolean;
  /** URL-encode auto-detected unsafe characters in the URL. */
  encodeUrl: boolean;
}

export interface HttpRequest {
  method: HttpMethod;
  /** May contain {{variables}} and :pathVariables. */
  url: string;
  queryParams: KeyValue[];
  pathVariables: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: Auth;
  scripts: RequestScripts;
  settings: RequestSettings;
}

export type WebSocketMessageFormat = "text" | "json" | "binary";

export interface WebSocketSavedMessage {
  id: string;
  name?: string;
  body: string;
  format: WebSocketMessageFormat;
}

export interface WebSocketRequest {
  url: string;
  protocols: string[];
  headers: KeyValue[];
  auth: Auth;
  savedMessages: WebSocketSavedMessage[];
}

// ---------------------------------------------------------------------------
// Collections (tree)
// ---------------------------------------------------------------------------

export type RequestProtocol = "http" | "websocket";

export interface RequestNode {
  kind: "request";
  id: string;
  name: string;
  description?: string;
  protocol: RequestProtocol;
  http?: HttpRequest;
  websocket?: WebSocketRequest;
}

export interface FolderNode {
  kind: "folder";
  id: string;
  name: string;
  description?: string;
  auth?: Auth;
  children: CollectionNode[];
}

export type CollectionNode = FolderNode | RequestNode;

export interface Variable {
  key: string;
  value: string;
  enabled: boolean;
  secret?: boolean;
  description?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  variables: Variable[];
  auth: Auth;
  children: CollectionNode[];
}

export interface Environment {
  id: string;
  name: string;
  variables: Variable[];
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface ResponseTimings {
  /** Epoch milliseconds when the request started. */
  startedAt: number;
  /** Total wall-clock duration in milliseconds. */
  durationMs: number;
}

export interface ResponseCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: KeyValue[];
  cookies: ResponseCookie[];
  bodyText: string;
  /** Set when the response is binary (non-text content type). */
  bodyBase64?: string;
  contentType?: string;
  sizeBytes: number;
  timings: ResponseTimings;
  redirected: boolean;
  finalUrl: string;
  testResults: TestResult[];
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Variable resolution scope
// ---------------------------------------------------------------------------

/**
 * Variable lookup scopes, applied in increasing precedence:
 * globals < collection < environment < local (script-set).
 */
export interface VariableScope {
  globals?: Variable[];
  collection?: Variable[];
  environment?: Variable[];
  local?: Record<string, string>;
}
