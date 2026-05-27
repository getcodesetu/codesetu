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
  CollectionNode,
  HttpRequest,
  RequestBody,
} from "../model.js";

const SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

/** Serializes a collection into a Postman v2.1 collection object. */
export function exportPostman(collection: Collection): Record<string, unknown> {
  return {
    info: { name: collection.name, schema: SCHEMA },
    item: collection.children.map(exportNode),
    variable: collection.variables.map((variable) => ({
      key: variable.key,
      value: variable.value,
      disabled: !variable.enabled,
    })),
    ...(collection.auth.type === "none" ? {} : { auth: exportAuth(collection.auth) }),
  };
}

function exportNode(node: CollectionNode): Record<string, unknown> {
  if (node.kind === "folder") {
    return {
      name: node.name,
      item: node.children.map(exportNode),
      ...(node.auth && node.auth.type !== "none" ? { auth: exportAuth(node.auth) } : {}),
    };
  }
  return { name: node.name, request: exportRequest(node.http) };
}

function exportRequest(http: HttpRequest | undefined): Record<string, unknown> {
  if (!http) {
    return { method: "GET", url: "" };
  }
  return {
    method: http.method,
    header: http.headers.map((header) => ({
      key: header.key,
      value: header.value,
      disabled: !header.enabled,
    })),
    url: {
      raw: http.url,
      query: http.queryParams.map((param) => ({
        key: param.key,
        value: param.value,
        disabled: !param.enabled,
      })),
      variable: http.pathVariables.map((variable) => ({ key: variable.key, value: variable.value })),
    },
    ...(http.body.mode === "none" ? {} : { body: exportBody(http.body) }),
    ...(http.auth.type === "none" || http.auth.type === "inherit" ? {} : { auth: exportAuth(http.auth) }),
  };
}

function exportBody(body: RequestBody): Record<string, unknown> {
  switch (body.mode) {
    case "raw":
      return {
        mode: "raw",
        raw: body.raw ?? "",
        options: { raw: { language: body.rawLanguage ?? "text" } },
      };
    case "urlencoded":
      return {
        mode: "urlencoded",
        urlencoded: (body.urlencoded ?? []).map((entry) => ({
          key: entry.key,
          value: entry.value,
          disabled: !entry.enabled,
        })),
      };
    case "form-data":
      return {
        mode: "formdata",
        formdata: (body.formData ?? []).map((field) =>
          field.kind === "file"
            ? { key: field.key, src: field.filePath ?? "", type: "file", disabled: !field.enabled }
            : { key: field.key, value: field.value ?? "", type: "text", disabled: !field.enabled },
        ),
      };
    case "graphql":
      return {
        mode: "graphql",
        graphql: { query: body.graphql?.query ?? "", variables: body.graphql?.variables ?? "" },
      };
    default:
      return { mode: "raw", raw: "" };
  }
}

function exportAuth(auth: Auth): Record<string, unknown> {
  switch (auth.type) {
    case "bearer":
      return { type: "bearer", bearer: [{ key: "token", value: auth.bearer?.token ?? "" }] };
    case "basic":
      return {
        type: "basic",
        basic: [
          { key: "username", value: auth.basic?.username ?? "" },
          { key: "password", value: auth.basic?.password ?? "" },
        ],
      };
    case "apikey":
      return {
        type: "apikey",
        apikey: [
          { key: "key", value: auth.apikey?.key ?? "" },
          { key: "value", value: auth.apikey?.value ?? "" },
          { key: "in", value: auth.apikey?.location ?? "header" },
        ],
      };
    default:
      return { type: "noauth" };
  }
}
