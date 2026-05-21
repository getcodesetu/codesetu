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

import type { ChatCompletion } from "openai/resources/chat/completions";

export function getAssistantText(completion: ChatCompletion): string {
  const content: unknown = completion.choices[0]?.message.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(readTextPart).join("");
  }

  return "";
}

function readTextPart(part: unknown): string {
  if (typeof part !== "object" || part === null) {
    return "";
  }

  const record = part as Record<string, unknown>;
  return typeof record.text === "string" ? record.text : "";
}
