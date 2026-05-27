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

import type { ResponseCookie } from "../model.js";

/** Parses a single Set-Cookie header value into a structured cookie. */
export function parseSetCookie(header: string): ResponseCookie | undefined {
  const segments = header.split(";");
  const first = segments.shift();
  if (!first) {
    return undefined;
  }
  const eq = first.indexOf("=");
  if (eq === -1) {
    return undefined;
  }

  const cookie: ResponseCookie = {
    name: first.slice(0, eq).trim(),
    value: first.slice(eq + 1).trim(),
  };

  for (const segment of segments) {
    const eqIndex = segment.indexOf("=");
    const attr = (eqIndex === -1 ? segment : segment.slice(0, eqIndex)).trim().toLowerCase();
    const attrValue = eqIndex === -1 ? "" : segment.slice(eqIndex + 1).trim();
    switch (attr) {
      case "domain":
        cookie.domain = attrValue;
        break;
      case "path":
        cookie.path = attrValue;
        break;
      case "expires":
        cookie.expires = attrValue;
        break;
      case "max-age": {
        const parsed = Number.parseInt(attrValue, 10);
        if (!Number.isNaN(parsed)) {
          cookie.maxAge = parsed;
        }
        break;
      }
      case "samesite":
        cookie.sameSite = attrValue;
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "secure":
        cookie.secure = true;
        break;
      default:
        break;
    }
  }

  return cookie;
}

export function parseSetCookies(headers: string[]): ResponseCookie[] {
  const cookies: ResponseCookie[] = [];
  for (const header of headers) {
    const cookie = parseSetCookie(header);
    if (cookie) {
      cookies.push(cookie);
    }
  }
  return cookies;
}
