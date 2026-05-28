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

import { createCollection, createDefaultHttpRequest, createNoneAuth, newId } from "../factory.js";
import type { Auth, Collection, CollectionNode, RawLanguage, RequestBody } from "../model.js";

interface InsomniaExport {
  _type?: string;
  resources?: InsomniaResource[];
}

interface InsomniaResource {
  _id?: string;
  _type?: string;
  parentId?: string;
  name?: string;
  method?: string;
  url?: string;
  headers?: { name?: string; value?: string; disabled?: boolean }[];
  parameters?: { name?: string; value?: string; disabled?: boolean }[];
  body?: {
    mimeType?: string;
    text?: string;
    params?: { name?: string; value?: string; disabled?: boolean }[];
  };
  authentication?: {
    type?: string;
    token?: string;
    username?: string;
    password?: string;
    key?: string;
    value?: string;
  };
}

export function isInsomniaExport(doc: unknown): boolean {
  if (typeof doc !== "object" || doc === null) {
    return false;
  }
  const candidate = doc as { _type?: string; resources?: unknown };
  return candidate._type === "export" && Array.isArray(candidate.resources);
}

export function importInsomnia(doc: unknown): Collection {
  const root = doc as InsomniaExport;
  const resources = root.resources ?? [];
  const collection = createCollection("Insomnia Import");

  const byParent = new Map<string, InsomniaResource[]>();
  for (const resource of resources) {
    if (resource._type === "request" || resource._type === "request_group") {
      const parent = resource.parentId ?? "";
      const list = byParent.get(parent) ?? [];
      list.push(resource);
      byParent.set(parent, list);
    }
  }

  const workspace = resources.find((resource) => resource._type === "workspace");
  if (workspace?.name) {
    collection.name = workspace.name;
  }
  const rootParent = workspace?._id ?? "";
  collection.children = buildChildren(rootParent, byParent);
  return collection;
}

function buildChildren(
  parentId: string,
  byParent: Map<string, InsomniaResource[]>,
): CollectionNode[] {
  return (byParent.get(parentId) ?? []).map((resource) => {
    if (resource._type === "request_group") {
      return {
        kind: "folder",
        id: resource._id ?? newId(),
        name: resource.name ?? "Folder",
        children: buildChildren(resource._id ?? "", byParent),
      };
    }
    return mapRequest(resource);
  });
}

function mapRequest(resource: InsomniaResource): CollectionNode {
  const request = createDefaultHttpRequest();
  request.method = resource.method ?? "GET";
  request.url = resource.url ?? "";
  request.headers = (resource.headers ?? []).map((header) => ({
    key: header.name ?? "",
    value: header.value ?? "",
    enabled: header.disabled !== true,
  }));
  request.queryParams = (resource.parameters ?? []).map((param) => ({
    key: param.name ?? "",
    value: param.value ?? "",
    enabled: param.disabled !== true,
  }));
  request.body = mapBody(resource.body);
  request.auth = mapAuth(resource.authentication);

  return {
    kind: "request",
    id: resource._id ?? newId(),
    name: resource.name ?? request.url,
    protocol: "http",
    http: request,
  };
}

function mapBody(body: InsomniaResource["body"]): RequestBody {
  if (!body || (!body.text && !body.params)) {
    return { mode: "none" };
  }
  const mime = (body.mimeType ?? "").toLowerCase();
  if (mime.includes("x-www-form-urlencoded")) {
    return {
      mode: "urlencoded",
      urlencoded: (body.params ?? []).map((param) => ({
        key: param.name ?? "",
        value: param.value ?? "",
        enabled: param.disabled !== true,
      })),
    };
  }
  return { mode: "raw", raw: body.text ?? "", rawLanguage: languageFor(mime) };
}

function mapAuth(auth: InsomniaResource["authentication"]): Auth {
  if (!auth || !auth.type) {
    return createNoneAuth();
  }
  switch (auth.type) {
    case "bearer":
      return { type: "bearer", bearer: { token: auth.token ?? "" } };
    case "basic":
      return {
        type: "basic",
        basic: { username: auth.username ?? "", password: auth.password ?? "" },
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: { key: auth.key ?? "", value: auth.value ?? "", location: "header" },
      };
    default:
      return createNoneAuth();
  }
}

function languageFor(mime: string): RawLanguage {
  if (mime.includes("json")) return "json";
  if (mime.includes("xml")) return "xml";
  if (mime.includes("html")) return "html";
  return "text";
}
