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

import { createDefaultHttpRequest, newId } from "../factory.js";
import type { KeyValue, RequestNode } from "../model.js";

/** Parses a single `curl` command into a request node. */
export function parseCurl(command: string): RequestNode {
  const tokens = tokenize(command);
  const request = createDefaultHttpRequest();
  const headers: KeyValue[] = [];
  const dataParts: string[] = [];
  let explicitMethod: string | undefined;
  let urlencoded = false;
  let url = "";

  let index = 0;
  // Skip a leading "curl".
  if (tokens[index]?.toLowerCase() === "curl") {
    index += 1;
  }

  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    switch (token) {
      case "-X":
      case "--request":
        explicitMethod = tokens[++index];
        break;
      case "-H":
      case "--header": {
        const header = tokens[++index] ?? "";
        const colon = header.indexOf(":");
        if (colon !== -1) {
          headers.push({
            key: header.slice(0, colon).trim(),
            value: header.slice(colon + 1).trim(),
            enabled: true,
          });
        }
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
      case "--data-ascii":
        dataParts.push(tokens[++index] ?? "");
        break;
      case "--data-urlencode":
        urlencoded = true;
        dataParts.push(tokens[++index] ?? "");
        break;
      case "-u":
      case "--user": {
        const credentials = tokens[++index] ?? "";
        const colon = credentials.indexOf(":");
        request.auth = {
          type: "basic",
          basic: {
            username: colon === -1 ? credentials : credentials.slice(0, colon),
            password: colon === -1 ? "" : credentials.slice(colon + 1),
          },
        };
        break;
      }
      case "-F":
      case "--form": {
        const field = tokens[++index] ?? "";
        const eq = field.indexOf("=");
        if (eq !== -1) {
          const value = field.slice(eq + 1);
          request.body.mode = "form-data";
          request.body.formData = request.body.formData ?? [];
          request.body.formData.push(
            value.startsWith("@")
              ? { key: field.slice(0, eq), kind: "file", filePath: value.slice(1), enabled: true }
              : { key: field.slice(0, eq), kind: "text", value, enabled: true },
          );
        }
        break;
      }
      case "--url":
        url = tokens[++index] ?? "";
        break;
      case "-b":
      case "--cookie":
        headers.push({ key: "Cookie", value: tokens[++index] ?? "", enabled: true });
        break;
      case "--compressed":
      case "-L":
      case "--location":
      case "-s":
      case "--silent":
      case "-k":
      case "--insecure":
      case "-i":
      case "--include":
        break;
      default:
        if (!token.startsWith("-") && url === "") {
          url = token;
        }
        break;
    }
    index += 1;
  }

  request.url = url;
  request.headers = headers;

  if (dataParts.length > 0) {
    const joined = dataParts.join("&");
    if (urlencoded || hasFormContentType(headers)) {
      request.body.mode = "urlencoded";
      request.body.urlencoded = parseUrlencoded(joined);
    } else {
      request.body.mode = "raw";
      request.body.raw = joined;
      request.body.rawLanguage = looksJson(joined) ? "json" : "text";
    }
  }

  request.method =
    explicitMethod ?? (dataParts.length > 0 || request.body.mode === "form-data" ? "POST" : "GET");

  return { kind: "request", id: newId(), name: deriveName(url), protocol: "http", http: request };
}

function tokenize(command: string): string[] {
  const normalized = command.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let hasToken = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }
  if (hasToken) {
    tokens.push(current);
  }
  return tokens;
}

function parseUrlencoded(data: string): KeyValue[] {
  return data
    .split("&")
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eq = pair.indexOf("=");
      const key = eq === -1 ? pair : pair.slice(0, eq);
      const value = eq === -1 ? "" : pair.slice(eq + 1);
      return { key: decodeSafe(key), value: decodeSafe(value), enabled: true };
    });
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function hasFormContentType(headers: KeyValue[]): boolean {
  return headers.some(
    (header) =>
      header.key.toLowerCase() === "content-type" &&
      header.value.toLowerCase().includes("application/x-www-form-urlencoded"),
  );
}

function looksJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function deriveName(url: string): string {
  if (!url) {
    return "cURL Request";
  }
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`);
    const path = parsed.pathname.replace(/\/$/, "");
    return path && path !== "/" ? path : parsed.host;
  } catch {
    return url;
  }
}
