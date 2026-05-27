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

import type { Auth } from "../model.js";

export interface AuthApplication {
  headers: { key: string; value: string }[];
  queryParams: { key: string; value: string }[];
}

/**
 * Computes the header and query additions for an auth config. The caller merges
 * these into the outgoing request. "inherit" and "none" produce nothing — the
 * caller resolves inheritance from the parent folder/collection beforehand.
 */
export function applyAuth(auth: Auth): AuthApplication {
  const result: AuthApplication = { headers: [], queryParams: [] };

  switch (auth.type) {
    case "bearer": {
      const token = auth.bearer?.token ?? "";
      if (token) {
        result.headers.push({ key: "Authorization", value: `Bearer ${token}` });
      }
      break;
    }
    case "basic": {
      const username = auth.basic?.username ?? "";
      const password = auth.basic?.password ?? "";
      const encoded = encodeBase64(`${username}:${password}`);
      result.headers.push({ key: "Authorization", value: `Basic ${encoded}` });
      break;
    }
    case "apikey": {
      const key = auth.apikey?.key ?? "";
      const value = auth.apikey?.value ?? "";
      if (key) {
        if (auth.apikey?.location === "query") {
          result.queryParams.push({ key, value });
        } else {
          result.headers.push({ key, value });
        }
      }
      break;
    }
    case "oauth2": {
      const token = auth.oauth2?.accessToken ?? "";
      if (token) {
        const prefix = auth.oauth2?.headerPrefix ?? "Bearer";
        result.headers.push({
          key: "Authorization",
          value: prefix ? `${prefix} ${token}` : token,
        });
      }
      break;
    }
    case "none":
    case "inherit":
    default:
      break;
  }

  return result;
}

function encodeBase64(value: string): string {
  const bufferCtor = (globalThis as { Buffer?: { from(input: string, enc: string): { toString(enc: string): string } } })
    .Buffer;
  if (bufferCtor) {
    return bufferCtor.from(value, "utf-8").toString("base64");
  }
  const encoder = (globalThis as { btoa?: (input: string) => string }).btoa;
  if (encoder) {
    return encoder(unescape(encodeURIComponent(value)));
  }
  throw new Error("No base64 encoder available in this runtime");
}
