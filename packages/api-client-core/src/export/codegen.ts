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

import { applyAuth } from "../engine/auth.js";
import type { HttpRequest, KeyValue, RequestBody } from "../model.js";

export type CodegenTarget = "curl" | "fetch" | "axios" | "python";

interface Prepared {
  url: string;
  method: string;
  headers: KeyValue[];
  body?: string;
}

/** Generates a runnable code snippet for the request in the chosen target language. */
export function generateCode(request: HttpRequest, target: CodegenTarget): string {
  const prepared = prepare(request);
  switch (target) {
    case "curl":
      return toCurl(prepared);
    case "fetch":
      return toFetch(prepared);
    case "axios":
      return toAxios(prepared);
    case "python":
      return toPython(prepared);
    default:
      return toCurl(prepared);
  }
}

function prepare(request: HttpRequest): Prepared {
  const headers = request.headers.filter((header) => header.enabled && header.key !== "");
  const application = applyAuth(request.auth);
  for (const header of application.headers) {
    headers.push({ key: header.key, value: header.value, enabled: true });
  }

  const query = request.queryParams.filter((param) => param.enabled && param.key !== "");
  for (const param of application.queryParams) {
    query.push({ key: param.key, value: param.value, enabled: true });
  }
  const url = buildUrl(request.url, query);

  const body = bodyToString(request.body);
  if (body?.contentType && !headers.some((h) => h.key.toLowerCase() === "content-type")) {
    headers.push({ key: "Content-Type", value: body.contentType, enabled: true });
  }

  return {
    url,
    method: request.method.toUpperCase(),
    headers,
    ...(body ? { body: body.text } : {}),
  };
}

function buildUrl(url: string, query: KeyValue[]): string {
  if (query.length === 0) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  const encoded = query
    .map((param) => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`)
    .join("&");
  return `${url}${separator}${encoded}`;
}

function bodyToString(body: RequestBody): { text: string; contentType?: string } | undefined {
  switch (body.mode) {
    case "raw":
      return {
        text: body.raw ?? "",
        ...(body.rawLanguage === "json" ? { contentType: "application/json" } : {}),
      };
    case "urlencoded":
      return {
        text: (body.urlencoded ?? [])
          .filter((entry) => entry.enabled)
          .map((entry) => `${encodeURIComponent(entry.key)}=${encodeURIComponent(entry.value)}`)
          .join("&"),
        contentType: "application/x-www-form-urlencoded",
      };
    case "graphql":
      return {
        text: JSON.stringify({
          query: body.graphql?.query ?? "",
          variables: safeParse(body.graphql?.variables),
        }),
        contentType: "application/json",
      };
    default:
      return undefined;
  }
}

function toCurl(prepared: Prepared): string {
  const lines = [`curl -X ${prepared.method} '${prepared.url}'`];
  for (const header of prepared.headers) {
    lines.push(`  -H '${header.key}: ${header.value}'`);
  }
  if (prepared.body !== undefined) {
    lines.push(`  --data '${prepared.body.replace(/'/g, "'\\''")}'`);
  }
  return lines.join(" \\\n");
}

function toFetch(prepared: Prepared): string {
  const headers = headerObject(prepared.headers);
  const options = [`  method: ${JSON.stringify(prepared.method)}`];
  if (Object.keys(headers).length > 0) {
    options.push(`  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, "\n  ")}`);
  }
  if (prepared.body !== undefined) {
    options.push(`  body: ${JSON.stringify(prepared.body)}`);
  }
  return `fetch(${JSON.stringify(prepared.url)}, {\n${options.join(",\n")}\n});`;
}

function toAxios(prepared: Prepared): string {
  const config: Record<string, unknown> = {
    method: prepared.method.toLowerCase(),
    url: prepared.url,
  };
  const headers = headerObject(prepared.headers);
  if (Object.keys(headers).length > 0) {
    config.headers = headers;
  }
  if (prepared.body !== undefined) {
    config.data = prepared.body;
  }
  return `axios(${JSON.stringify(config, null, 2)});`;
}

function toPython(prepared: Prepared): string {
  const headers = headerObject(prepared.headers);
  const lines = ["import requests", ""];
  const args = [JSON.stringify(prepared.method), JSON.stringify(prepared.url)];
  if (Object.keys(headers).length > 0) {
    args.push(`headers=${JSON.stringify(headers)}`);
  }
  if (prepared.body !== undefined) {
    args.push(`data=${JSON.stringify(prepared.body)}`);
  }
  lines.push(`response = requests.request(${args.join(", ")})`);
  lines.push("print(response.text)");
  return lines.join("\n");
}

function headerObject(headers: KeyValue[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const header of headers) {
    result[header.key] = header.value;
  }
  return result;
}

function safeParse(value: string | undefined): unknown {
  if (!value || value.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
