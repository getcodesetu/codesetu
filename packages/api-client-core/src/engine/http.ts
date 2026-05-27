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

import { Buffer } from "node:buffer";
import http from "node:http";
import https from "node:https";

import type {
  Auth,
  HttpRequest,
  HttpResponse,
  KeyValue,
  ResponseCookie,
  VariableScope,
} from "../model.js";
import { applyAuth } from "./auth.js";
import { buildBody, type FileReader } from "./body.js";
import { isTextualContentType, mimeOf } from "./contentType.js";
import { parseSetCookies } from "./cookies.js";
import { resolveVariables } from "./variables.js";

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

export interface ExecuteOptions {
  scope?: VariableScope;
  readFile?: FileReader;
  signal?: AbortSignal;
  /** Auth resolved from a parent folder/collection when the request inherits. */
  inheritedAuth?: Auth;
}

interface HopResult {
  status: number;
  statusText: string;
  headers: KeyValue[];
  setCookies: string[];
  location?: string;
  body: Buffer;
  finalUrl: string;
}

/** Resolves variables, applies auth, executes an HTTP request, and decodes the response. */
export async function executeHttpRequest(
  request: HttpRequest,
  options: ExecuteOptions = {},
): Promise<HttpResponse> {
  const scope = options.scope ?? {};
  const startedAt = Date.now();
  const startPerf = performanceNow();

  const url = buildUrl(request, scope);
  const auth = resolveAuth(effectiveAuth(request.auth, options.inheritedAuth), scope);
  const application = applyAuth(auth);
  for (const param of application.queryParams) {
    url.searchParams.append(param.key, param.value);
  }

  const headers = buildHeaders(request, scope, application.headers);
  const built = await buildBody(resolveBody(request, scope), options.readFile);
  if (built.contentType && !hasHeader(headers, "content-type")) {
    headers.push({ key: "Content-Type", value: built.contentType, enabled: true });
  }

  const cookies: ResponseCookie[] = [];
  let currentUrl = url;
  let method = request.method.toUpperCase();
  let body = built.buffer;
  let redirected = false;
  let last: HopResult | undefined;

  for (let hop = 0; hop <= request.settings.maxRedirects; hop += 1) {
    last = await performHop(currentUrl, method, headers, body, request.settings, options.signal);
    cookies.push(...parseSetCookies(last.setCookies));

    if (
      !request.settings.followRedirects ||
      !REDIRECT_STATUS.has(last.status) ||
      !last.location
    ) {
      break;
    }

    redirected = true;
    currentUrl = new URL(last.location, currentUrl);
    if (last.status === 303 || ((last.status === 301 || last.status === 302) && method !== "GET" && method !== "HEAD")) {
      method = "GET";
      body = undefined;
      removeHeader(headers, "content-type");
      removeHeader(headers, "content-length");
    }
  }

  if (!last) {
    throw new Error("Request produced no response");
  }

  const durationMs = performanceNow() - startPerf;
  return decodeResponse(last, cookies, redirected, { startedAt, durationMs });
}

function decodeResponse(
  hop: HopResult,
  cookies: ResponseCookie[],
  redirected: boolean,
  timings: { startedAt: number; durationMs: number },
): HttpResponse {
  const contentType = headerValue(hop.headers, "content-type");
  const textual = isTextualContentType(contentType);
  const bodyText = textual ? hop.body.toString("utf-8") : "";
  const bodyBase64 = textual ? undefined : hop.body.toString("base64");

  return {
    status: hop.status,
    statusText: hop.statusText,
    ok: hop.status >= 200 && hop.status < 300,
    headers: hop.headers,
    cookies,
    bodyText,
    ...(bodyBase64 === undefined ? {} : { bodyBase64 }),
    ...(contentType === undefined ? {} : { contentType: mimeOf(contentType) }),
    sizeBytes: hop.body.byteLength,
    timings: { startedAt: timings.startedAt, durationMs: Math.round(timings.durationMs) },
    redirected,
    finalUrl: hop.finalUrl,
    testResults: [],
  };
}

function performHop(
  url: URL,
  method: string,
  headers: KeyValue[],
  body: Buffer | undefined,
  settings: HttpRequest["settings"],
  signal: AbortSignal | undefined,
): Promise<HopResult> {
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  const outgoingHeaders = toOutgoingHeaders(headers);
  if (body && !hasHeaderRecord(outgoingHeaders, "content-length")) {
    outgoingHeaders["Content-Length"] = String(body.byteLength);
  }
  if (!hasHeaderRecord(outgoingHeaders, "user-agent")) {
    outgoingHeaders["User-Agent"] = "CodeSetu-APIClient";
  }

  return new Promise<HopResult>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method,
        headers: outgoingHeaders,
        ...(isHttps ? { rejectUnauthorized: settings.verifyTls } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            headers: fromIncomingHeaders(res.headers),
            setCookies: normalizeSetCookie(res.headers["set-cookie"]),
            ...(typeof res.headers.location === "string" ? { location: res.headers.location } : {}),
            body: Buffer.concat(chunks),
            finalUrl: url.toString(),
          });
        });
        res.on("error", reject);
      },
    );

    const onAbort = (): void => {
      req.destroy(new Error("Request aborted"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    req.setTimeout(settings.timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${settings.timeoutMs}ms`));
    });
    req.on("error", (error) => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      reject(error);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

function buildUrl(request: HttpRequest, scope: VariableScope): URL {
  let raw = resolveVariables(request.url, scope).trim();
  for (const pathVar of request.pathVariables) {
    if (!pathVar.enabled || pathVar.key.length === 0) {
      continue;
    }
    const value = encodeURIComponent(resolveVariables(pathVar.value, scope));
    raw = raw.replace(new RegExp(`:${escapeRegExp(pathVar.key)}(?=/|$|\\?)`, "g"), value);
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw)) {
    raw = `http://${raw}`;
  }
  const url = new URL(raw);
  for (const param of request.queryParams) {
    if (param.enabled && param.key.length > 0) {
      url.searchParams.append(
        resolveVariables(param.key, scope),
        resolveVariables(param.value, scope),
      );
    }
  }
  return url;
}

function buildHeaders(
  request: HttpRequest,
  scope: VariableScope,
  authHeaders: { key: string; value: string }[],
): KeyValue[] {
  const headers: KeyValue[] = [];
  for (const header of request.headers) {
    if (header.enabled && header.key.length > 0) {
      headers.push({
        key: resolveVariables(header.key, scope),
        value: resolveVariables(header.value, scope),
        enabled: true,
      });
    }
  }
  for (const header of authHeaders) {
    headers.push({ key: header.key, value: header.value, enabled: true });
  }
  return headers;
}

function resolveBody(request: HttpRequest, scope: VariableScope): HttpRequest["body"] {
  const body = request.body;
  return {
    ...body,
    ...(body.raw === undefined ? {} : { raw: resolveVariables(body.raw, scope) }),
    ...(body.urlencoded
      ? {
          urlencoded: body.urlencoded.map((entry) => ({
            ...entry,
            key: resolveVariables(entry.key, scope),
            value: resolveVariables(entry.value, scope),
          })),
        }
      : {}),
    ...(body.formData
      ? {
          formData: body.formData.map((entry) => ({
            ...entry,
            key: resolveVariables(entry.key, scope),
            ...(entry.value === undefined ? {} : { value: resolveVariables(entry.value, scope) }),
          })),
        }
      : {}),
    ...(body.graphql
      ? {
          graphql: {
            query: resolveVariables(body.graphql.query, scope),
            ...(body.graphql.variables === undefined
              ? {}
              : { variables: resolveVariables(body.graphql.variables, scope) }),
          },
        }
      : {}),
  };
}

function effectiveAuth(requestAuth: Auth, inherited: Auth | undefined): Auth {
  if (requestAuth.type === "inherit" && inherited) {
    return inherited;
  }
  return requestAuth;
}

function resolveAuth(auth: Auth, scope: VariableScope): Auth {
  const resolve = (value: string | undefined): string | undefined =>
    value === undefined ? undefined : resolveVariables(value, scope);
  return {
    type: auth.type,
    ...(auth.basic
      ? { basic: { username: resolve(auth.basic.username) ?? "", password: resolve(auth.basic.password) ?? "" } }
      : {}),
    ...(auth.bearer ? { bearer: { token: resolve(auth.bearer.token) ?? "" } } : {}),
    ...(auth.apikey
      ? {
          apikey: {
            key: resolve(auth.apikey.key) ?? "",
            value: resolve(auth.apikey.value) ?? "",
            location: auth.apikey.location,
          },
        }
      : {}),
    ...(auth.oauth2
      ? { oauth2: { ...auth.oauth2, accessToken: resolve(auth.oauth2.accessToken) } }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Header utilities
// ---------------------------------------------------------------------------

function toOutgoingHeaders(headers: KeyValue[]): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const header of headers) {
    const existing = out[header.key];
    if (existing === undefined) {
      out[header.key] = header.value;
    } else if (Array.isArray(existing)) {
      existing.push(header.value);
    } else {
      out[header.key] = [existing, header.value];
    }
  }
  return out;
}

function fromIncomingHeaders(headers: http.IncomingHttpHeaders): KeyValue[] {
  const result: KeyValue[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        result.push({ key, value: item, enabled: true });
      }
    } else {
      result.push({ key, value, enabled: true });
    }
  }
  return result;
}

function normalizeSetCookie(value: string | string[] | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function hasHeader(headers: KeyValue[], lowerKey: string): boolean {
  return headers.some((header) => header.key.toLowerCase() === lowerKey);
}

function removeHeader(headers: KeyValue[], lowerKey: string): void {
  for (let i = headers.length - 1; i >= 0; i -= 1) {
    if (headers[i]?.key.toLowerCase() === lowerKey) {
      headers.splice(i, 1);
    }
  }
}

function headerValue(headers: KeyValue[], lowerKey: string): string | undefined {
  return headers.find((header) => header.key.toLowerCase() === lowerKey)?.value;
}

function hasHeaderRecord(headers: Record<string, string | string[]>, lowerKey: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === lowerKey);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function performanceNow(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
}
