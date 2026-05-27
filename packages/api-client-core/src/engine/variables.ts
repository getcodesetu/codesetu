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

import type { Variable, VariableScope } from "../model.js";

const VAR_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
const MAX_RESOLUTION_DEPTH = 12;

/**
 * Merges scopes into a flat lookup map. Precedence, lowest to highest:
 * globals < collection < environment < local (script-assigned).
 */
export function buildVariableMap(scope: VariableScope): Map<string, string> {
  const map = new Map<string, string>();
  applyVariables(map, scope.globals);
  applyVariables(map, scope.collection);
  applyVariables(map, scope.environment);
  if (scope.local) {
    for (const [key, value] of Object.entries(scope.local)) {
      map.set(key, value);
    }
  }
  return map;
}

function applyVariables(map: Map<string, string>, variables?: Variable[]): void {
  if (!variables) {
    return;
  }
  for (const variable of variables) {
    if (variable.enabled) {
      map.set(variable.key, variable.value);
    }
  }
}

/**
 * Substitutes {{variable}} and {{$dynamic}} tokens in a template. Resolves
 * nested references iteratively and leaves unknown tokens untouched.
 */
export function resolveVariables(template: string, scope: VariableScope): string {
  const map = buildVariableMap(scope);
  return resolveWithMap(template, map);
}

function resolveWithMap(template: string, map: Map<string, string>): string {
  let current = template;
  for (let depth = 0; depth < MAX_RESOLUTION_DEPTH; depth += 1) {
    let changed = false;
    current = current.replace(VAR_PATTERN, (match, rawKey: string) => {
      const key = rawKey.trim();
      const dynamic = resolveDynamicVariable(key);
      if (dynamic !== undefined) {
        changed = true;
        return dynamic;
      }
      const value = map.get(key);
      if (value !== undefined) {
        changed = true;
        return value;
      }
      return match;
    });
    if (!changed) {
      break;
    }
  }
  return current;
}

/** Returns true if the template still contains an unresolved {{token}}. */
export function hasUnresolvedVariables(value: string): boolean {
  VAR_PATTERN.lastIndex = 0;
  return VAR_PATTERN.test(value);
}

function resolveDynamicVariable(key: string): string | undefined {
  switch (key) {
    case "$guid":
    case "$randomUUID":
      return randomUuid();
    case "$timestamp":
      return Math.floor(Date.now() / 1000).toString();
    case "$isoTimestamp":
      return new Date().toISOString();
    case "$randomInt":
      return Math.floor(Math.random() * 1001).toString();
    default:
      return undefined;
  }
}

function randomUuid(): string {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}
