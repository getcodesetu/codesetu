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

import type { RequestBody } from "../model.js";

export type FileReader = (path: string) => Promise<Uint8Array>;

export interface BuiltBody {
  buffer?: Buffer;
  /** Content-Type to use when the request has no explicit Content-Type header. */
  contentType?: string;
}

const RAW_LANGUAGE_CONTENT_TYPES: Record<string, string> = {
  json: "application/json",
  text: "text/plain",
  xml: "application/xml",
  html: "text/html",
  javascript: "application/javascript",
};

/**
 * Serializes a (variable-resolved) request body into bytes plus a fallback
 * Content-Type. File-backed parts require a FileReader; omitting one throws.
 */
export async function buildBody(body: RequestBody, readFile?: FileReader): Promise<BuiltBody> {
  switch (body.mode) {
    case "none":
      return {};

    case "raw": {
      const raw = body.raw ?? "";
      return {
        buffer: Buffer.from(raw, "utf-8"),
        contentType: RAW_LANGUAGE_CONTENT_TYPES[body.rawLanguage ?? "text"] ?? "text/plain",
      };
    }

    case "urlencoded": {
      const pairs = (body.urlencoded ?? [])
        .filter((entry) => entry.enabled && entry.key.length > 0)
        .map((entry) => `${encodeURIComponent(entry.key)}=${encodeURIComponent(entry.value)}`);
      return {
        buffer: Buffer.from(pairs.join("&"), "utf-8"),
        contentType: "application/x-www-form-urlencoded",
      };
    }

    case "graphql": {
      const payload = JSON.stringify({
        query: body.graphql?.query ?? "",
        variables: parseGraphQlVariables(body.graphql?.variables),
      });
      return { buffer: Buffer.from(payload, "utf-8"), contentType: "application/json" };
    }

    case "binary": {
      if (!body.binaryFilePath) {
        return {};
      }
      const bytes = await readFileOrThrow(body.binaryFilePath, readFile);
      return { buffer: Buffer.from(bytes), contentType: "application/octet-stream" };
    }

    case "form-data":
      return buildMultipart(body, readFile);

    default:
      return {};
  }
}

async function buildMultipart(body: RequestBody, readFile?: FileReader): Promise<BuiltBody> {
  const boundary = `----CodeSetuFormBoundary${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];
  const newline = "\r\n";

  for (const field of body.formData ?? []) {
    if (!field.enabled || field.key.length === 0) {
      continue;
    }
    if (field.kind === "file") {
      if (!field.filePath) {
        continue;
      }
      const bytes = await readFileOrThrow(field.filePath, readFile);
      const fileName = field.filePath.split(/[\\/]/).pop() ?? "file";
      const contentType = field.contentType ?? "application/octet-stream";
      const header =
        `--${boundary}${newline}` +
        `Content-Disposition: form-data; name="${field.key}"; filename="${fileName}"${newline}` +
        `Content-Type: ${contentType}${newline}${newline}`;
      parts.push(Buffer.from(header, "utf-8"), Buffer.from(bytes), Buffer.from(newline, "utf-8"));
    } else {
      const header =
        `--${boundary}${newline}` +
        `Content-Disposition: form-data; name="${field.key}"${newline}${newline}`;
      parts.push(Buffer.from(header + (field.value ?? "") + newline, "utf-8"));
    }
  }

  parts.push(Buffer.from(`--${boundary}--${newline}`, "utf-8"));

  return {
    buffer: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function readFileOrThrow(path: string, readFile?: FileReader): Promise<Uint8Array> {
  if (!readFile) {
    throw new Error(`Cannot read file "${path}": no file reader available in this runtime`);
  }
  return readFile(path);
}

function parseGraphQlVariables(raw: string | undefined): unknown {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
