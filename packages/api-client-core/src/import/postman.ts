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

import { createDefaultHttpRequest, createNoneAuth, newId } from "../factory.js";
import type {
  Auth,
  Collection,
  CollectionNode,
  KeyValue,
  RawLanguage,
  RequestBody,
  Variable,
} from "../model.js";

interface PostmanCollection {
  info?: { name?: string };
  item?: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth;
}

interface PostmanItem {
  name?: string;
  item?: PostmanItem[];
  request?: PostmanRequest | string;
  auth?: PostmanAuth;
}

interface PostmanRequest {
  method?: string;
  header?: PostmanHeader[];
  url?: PostmanUrl | string;
  body?: PostmanBody;
  auth?: PostmanAuth;
}

interface PostmanHeader {
  key?: string;
  value?: string;
  disabled?: boolean;
}

interface PostmanUrl {
  raw?: string;
  host?: string[];
  path?: string[] | string;
  query?: { key?: string; value?: string; disabled?: boolean }[];
  variable?: { key?: string; value?: string }[];
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  options?: { raw?: { language?: string } };
  urlencoded?: { key?: string; value?: string; disabled?: boolean }[];
  formdata?: { key?: string; value?: string; src?: string; type?: string; disabled?: boolean }[];
  graphql?: { query?: string; variables?: string };
}

interface PostmanVariable {
  key?: string;
  value?: string;
  disabled?: boolean;
}

interface PostmanAuth {
  type?: string;
  bearer?: { key?: string; value?: string }[];
  basic?: { key?: string; value?: string }[];
  apikey?: { key?: string; value?: string }[];
}

export function isPostmanCollection(doc: unknown): boolean {
  if (typeof doc !== "object" || doc === null) {
    return false;
  }
  const candidate = doc as { info?: { schema?: string }; item?: unknown };
  return Array.isArray(candidate.item) || typeof candidate.info?.schema === "string";
}

export function importPostman(doc: unknown): Collection {
  const root = doc as PostmanCollection;
  return {
    id: newId(),
    name: root.info?.name ?? "Imported Collection",
    variables: mapVariables(root.variable),
    auth: mapAuth(root.auth),
    children: (root.item ?? []).map(mapItem),
  };
}

function mapItem(item: PostmanItem): CollectionNode {
  if (Array.isArray(item.item)) {
    return {
      kind: "folder",
      id: newId(),
      name: item.name ?? "Folder",
      ...(item.auth ? { auth: mapAuth(item.auth) } : {}),
      children: item.item.map(mapItem),
    };
  }

  const request = createDefaultHttpRequest();
  const source = typeof item.request === "string" ? { url: item.request } : item.request ?? {};
  request.method = source.method ?? "GET";
  request.headers = mapHeaders(source.header);
  applyUrl(request, source.url);
  request.body = mapBody(source.body);
  request.auth = mapAuth(source.auth);

  return { kind: "request", id: newId(), name: item.name ?? request.url, protocol: "http", http: request };
}

function mapHeaders(headers: PostmanHeader[] | undefined): KeyValue[] {
  return (headers ?? []).map((header) => ({
    key: header.key ?? "",
    value: header.value ?? "",
    enabled: header.disabled !== true,
  }));
}

function applyUrl(request: ReturnType<typeof createDefaultHttpRequest>, url: PostmanUrl | string | undefined): void {
  if (url === undefined) {
    return;
  }
  if (typeof url === "string") {
    request.url = url;
    return;
  }

  request.url = url.raw ?? buildUrlString(url);
  request.queryParams = (url.query ?? []).map((entry) => ({
    key: entry.key ?? "",
    value: entry.value ?? "",
    enabled: entry.disabled !== true,
  }));
  request.pathVariables = (url.variable ?? []).map((entry) => ({
    key: entry.key ?? "",
    value: entry.value ?? "",
    enabled: true,
  }));
}

function buildUrlString(url: PostmanUrl): string {
  const host = Array.isArray(url.host) ? url.host.join(".") : "";
  const path = Array.isArray(url.path) ? url.path.join("/") : url.path ?? "";
  if (!host && !path) {
    return "";
  }
  return `${host}${path ? `/${path}` : ""}`;
}

function mapBody(body: PostmanBody | undefined): RequestBody {
  if (!body || !body.mode) {
    return { mode: "none" };
  }
  switch (body.mode) {
    case "raw":
      return {
        mode: "raw",
        raw: body.raw ?? "",
        rawLanguage: mapLanguage(body.options?.raw?.language),
      };
    case "urlencoded":
      return {
        mode: "urlencoded",
        urlencoded: (body.urlencoded ?? []).map((entry) => ({
          key: entry.key ?? "",
          value: entry.value ?? "",
          enabled: entry.disabled !== true,
        })),
      };
    case "formdata":
      return {
        mode: "form-data",
        formData: (body.formdata ?? []).map((entry) =>
          entry.type === "file"
            ? { key: entry.key ?? "", kind: "file", filePath: entry.src ?? "", enabled: entry.disabled !== true }
            : { key: entry.key ?? "", kind: "text", value: entry.value ?? "", enabled: entry.disabled !== true },
        ),
      };
    case "graphql":
      return {
        mode: "graphql",
        graphql: { query: body.graphql?.query ?? "", variables: body.graphql?.variables ?? "" },
      };
    default:
      return { mode: "none" };
  }
}

function mapLanguage(language: string | undefined): RawLanguage {
  switch (language) {
    case "json":
    case "xml":
    case "html":
    case "javascript":
      return language;
    default:
      return "text";
  }
}

function mapAuth(auth: PostmanAuth | undefined): Auth {
  if (!auth || !auth.type) {
    return createNoneAuth();
  }
  switch (auth.type) {
    case "bearer":
      return { type: "bearer", bearer: { token: readAuthValue(auth.bearer, "token") } };
    case "basic":
      return {
        type: "basic",
        basic: {
          username: readAuthValue(auth.basic, "username"),
          password: readAuthValue(auth.basic, "password"),
        },
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: {
          key: readAuthValue(auth.apikey, "key"),
          value: readAuthValue(auth.apikey, "value"),
          location: readAuthValue(auth.apikey, "in") === "query" ? "query" : "header",
        },
      };
    default:
      return createNoneAuth();
  }
}

function readAuthValue(entries: { key?: string; value?: string }[] | undefined, key: string): string {
  return entries?.find((entry) => entry.key === key)?.value ?? "";
}

function mapVariables(variables: PostmanVariable[] | undefined): Variable[] {
  return (variables ?? []).map((variable) => ({
    key: variable.key ?? "",
    value: variable.value ?? "",
    enabled: variable.disabled !== true,
  }));
}
