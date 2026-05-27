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

const TEXTUAL_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/ecmascript",
  "application/x-www-form-urlencoded",
  "application/graphql",
  "image/svg+xml",
]);

/** Returns true when a response body should be decoded as UTF-8 text. */
export function isTextualContentType(contentType: string | undefined): boolean {
  if (!contentType) {
    return true;
  }
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime.startsWith("text/")) {
    return true;
  }
  if (mime.endsWith("+json") || mime.endsWith("+xml")) {
    return true;
  }
  return TEXTUAL_TYPES.has(mime);
}

export function mimeOf(contentType: string | undefined): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}
