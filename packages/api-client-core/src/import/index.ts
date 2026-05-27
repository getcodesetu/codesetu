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

import { parse as parseYaml } from "yaml";

import { createCollection } from "../factory.js";
import type { Collection } from "../model.js";
import { parseCurl } from "./curl.js";
import { importHar, isHar } from "./har.js";
import { importInsomnia, isInsomniaExport } from "./insomnia.js";
import { importOpenApi, isOpenApi } from "./openapi.js";
import { importPostman, isPostmanCollection } from "./postman.js";

export type ImportFormat = "postman" | "openapi" | "insomnia" | "har" | "curl" | "auto";

export interface ImportResult {
  collections: Collection[];
  format: Exclude<ImportFormat, "auto">;
}

export { parseCurl } from "./curl.js";
export { importPostman, isPostmanCollection } from "./postman.js";
export { importOpenApi, isOpenApi } from "./openapi.js";
export { importInsomnia, isInsomniaExport } from "./insomnia.js";
export { importHar, isHar } from "./har.js";

/** Parses collection text in any supported format. Auto-detects when format is "auto". */
export function importCollections(text: string, format: ImportFormat = "auto"): ImportResult {
  const trimmed = text.trim();

  if (format === "curl" || (format === "auto" && /^curl\b/i.test(trimmed))) {
    const collection = createCollection("cURL Import");
    collection.children = [parseCurl(trimmed)];
    return { collections: [collection], format: "curl" };
  }

  const doc = parseDoc(trimmed);

  switch (format) {
    case "postman":
      return { collections: [importPostman(doc)], format: "postman" };
    case "openapi":
      return { collections: [importOpenApi(doc)], format: "openapi" };
    case "insomnia":
      return { collections: [importInsomnia(doc)], format: "insomnia" };
    case "har":
      return { collections: [importHar(doc)], format: "har" };
    case "auto":
      return autoDetect(doc);
    default:
      return autoDetect(doc);
  }
}

function autoDetect(doc: unknown): ImportResult {
  if (isOpenApi(doc)) {
    return { collections: [importOpenApi(doc)], format: "openapi" };
  }
  if (isInsomniaExport(doc)) {
    return { collections: [importInsomnia(doc)], format: "insomnia" };
  }
  if (isHar(doc)) {
    return { collections: [importHar(doc)], format: "har" };
  }
  if (isPostmanCollection(doc)) {
    return { collections: [importPostman(doc)], format: "postman" };
  }
  throw new Error(
    "Unrecognized collection format. Expected Postman, OpenAPI, Insomnia, HAR, or cURL.",
  );
}

function parseDoc(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Not JSON — try YAML (OpenAPI specs are commonly YAML).
  }
  try {
    return parseYaml(text) as unknown;
  } catch {
    throw new Error("Could not parse the import as JSON or YAML.");
  }
}
