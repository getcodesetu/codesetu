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

export interface FimContextInput {
  text: string;
  offset: number;
  maxPrefixChars: number;
  maxSuffixChars: number;
}

export interface FimContext {
  prompt: string;
  suffix: string;
}

export function buildFimContext(input: FimContextInput): FimContext {
  const safeOffset = Math.max(0, Math.min(input.offset, input.text.length));
  const prefix = input.text.slice(0, safeOffset);
  const suffix = input.text.slice(safeOffset);

  return {
    prompt: prefix.slice(Math.max(0, prefix.length - input.maxPrefixChars)),
    suffix: suffix.slice(0, input.maxSuffixChars),
  };
}
