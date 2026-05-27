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
import type { Collection, CollectionNode, FolderNode, KeyValue, RequestNode } from "../model.js";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

interface OpenApiDoc {
  openapi?: string;
  swagger?: string;
  info?: { title?: string };
  servers?: { url?: string }[];
  paths?: Record<string, Record<string, unknown>>;
}

interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: { content?: Record<string, { example?: unknown; schema?: { example?: unknown } }> };
}

interface OpenApiParameter {
  name?: string;
  in?: string;
  required?: boolean;
  example?: unknown;
  schema?: { example?: unknown; default?: unknown };
}

export function isOpenApi(doc: unknown): boolean {
  if (typeof doc !== "object" || doc === null) {
    return false;
  }
  const candidate = doc as { openapi?: unknown; swagger?: unknown; paths?: unknown };
  return (
    (typeof candidate.openapi === "string" || typeof candidate.swagger === "string") &&
    typeof candidate.paths === "object"
  );
}

export function importOpenApi(doc: unknown): Collection {
  const root = doc as OpenApiDoc;
  const collection = createCollection(root.info?.title ?? "OpenAPI Import");
  const baseUrl = root.servers?.[0]?.url ?? "";
  const folders = new Map<string, FolderNode>();
  const looseRequests: CollectionNode[] = [];

  for (const [path, pathItem] of Object.entries(root.paths ?? {})) {
    const pathParameters = readParameters(pathItem.parameters);
    for (const method of HTTP_METHODS) {
      const operation = readOperation(pathItem[method]);
      if (!operation) {
        continue;
      }
      const node = buildRequest(method, path, baseUrl, operation, pathParameters);
      const tag = operation.tags?.[0];
      if (tag) {
        const folder = folders.get(tag) ?? createFolder(tag);
        folder.children.push(node);
        folders.set(tag, folder);
      } else {
        looseRequests.push(node);
      }
    }
  }

  collection.children = [...folders.values(), ...looseRequests];
  return collection;
}

function buildRequest(
  method: string,
  path: string,
  baseUrl: string,
  operation: OpenApiOperation,
  pathParameters: OpenApiParameter[],
): RequestNode {
  const request = createDefaultHttpRequest();
  request.method = method.toUpperCase();
  request.url = `${trimTrailingSlash(baseUrl)}${convertPath(path)}`;

  const parameters = [...pathParameters, ...readParameters(operation.parameters)];
  request.queryParams = parameters.filter((p) => p.in === "query").map(toKeyValue);
  request.headers = parameters.filter((p) => p.in === "header").map(toKeyValue);
  request.pathVariables = parameters
    .filter((p) => p.in === "path")
    .map((p) => ({ key: p.name ?? "", value: exampleString(p), enabled: true }));

  const jsonContent = operation.requestBody?.content?.["application/json"];
  if (jsonContent) {
    const example = jsonContent.example ?? jsonContent.schema?.example;
    request.body = {
      mode: "raw",
      rawLanguage: "json",
      raw: example === undefined ? "{}" : JSON.stringify(example, null, 2),
    };
  }

  return {
    kind: "request",
    id: newId(),
    name: operation.operationId ?? operation.summary ?? `${request.method} ${path}`,
    protocol: "http",
    http: request,
  };
}

function toKeyValue(parameter: OpenApiParameter): KeyValue {
  return {
    key: parameter.name ?? "",
    value: exampleString(parameter),
    enabled: parameter.required === true,
  };
}

function exampleString(parameter: OpenApiParameter): string {
  const value = parameter.example ?? parameter.schema?.example ?? parameter.schema?.default;
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function readOperation(value: unknown): OpenApiOperation | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as OpenApiOperation;
}

function readParameters(value: unknown): OpenApiParameter[] {
  return Array.isArray(value) ? (value as OpenApiParameter[]) : [];
}

function convertPath(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function createFolder(name: string): FolderNode {
  return { kind: "folder", id: newId(), name, children: [] };
}
