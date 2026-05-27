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

import { createCollection, createDefaultHttpRequest, newId } from "../factory.js";
import type { Collection, KeyValue, RawLanguage, RequestNode } from "../model.js";

interface Har {
  log?: { entries?: HarEntry[] };
}

interface HarEntry {
  request?: HarRequest;
}

interface HarRequest {
  method?: string;
  url?: string;
  headers?: { name?: string; value?: string }[];
  queryString?: { name?: string; value?: string }[];
  postData?: { mimeType?: string; text?: string; params?: { name?: string; value?: string }[] };
}

export function isHar(doc: unknown): boolean {
  if (typeof doc !== "object" || doc === null) {
    return false;
  }
  const candidate = doc as { log?: { entries?: unknown } };
  return Array.isArray(candidate.log?.entries);
}

export function importHar(doc: unknown): Collection {
  const har = doc as Har;
  const collection = createCollection("HAR Import");
  collection.children = (har.log?.entries ?? [])
    .map((entry) => entry.request)
    .filter((request): request is HarRequest => request !== undefined)
    .map(mapEntry);
  return collection;
}

function mapEntry(source: HarRequest): RequestNode {
  const request = createDefaultHttpRequest();
  request.method = source.method ?? "GET";
  request.url = stripQuery(source.url ?? "");
  request.headers = mapNameValue(source.headers).filter((header) => !header.key.startsWith(":"));
  request.queryParams = mapNameValue(source.queryString);

  const postData = source.postData;
  if (postData?.text) {
    const mime = (postData.mimeType ?? "").toLowerCase();
    if (mime.includes("x-www-form-urlencoded")) {
      request.body = { mode: "urlencoded", urlencoded: mapNameValue(postData.params) };
    } else {
      request.body = { mode: "raw", raw: postData.text, rawLanguage: languageFor(mime) };
    }
  }

  return {
    kind: "request",
    id: newId(),
    name: nameFor(request.url, request.method),
    protocol: "http",
    http: request,
  };
}

function mapNameValue(entries: { name?: string; value?: string }[] | undefined): KeyValue[] {
  return (entries ?? []).map((entry) => ({
    key: entry.name ?? "",
    value: entry.value ?? "",
    enabled: true,
  }));
}

function stripQuery(url: string): string {
  const index = url.indexOf("?");
  return index === -1 ? url : url.slice(0, index);
}

function languageFor(mime: string): RawLanguage {
  if (mime.includes("json")) return "json";
  if (mime.includes("xml")) return "xml";
  if (mime.includes("html")) return "html";
  return "text";
}

function nameFor(url: string, method: string): string {
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`);
    return `${method} ${parsed.pathname}`;
  } catch {
    return `${method} ${url}`;
  }
}
