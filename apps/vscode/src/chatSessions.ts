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

import type { ChatMessage } from "@codesetu/core";

/** One saved conversation: its transcript plus display metadata. */
export interface ChatSession {
  id: string;
  title: string;
  /** Epoch millis of the last update — drives most-recent-first ordering. */
  updatedAt: number;
  messages: ChatMessage[];
}

const MAX_TITLE_CHARS = 60;

/** Cap stored sessions so workspace state can't grow without bound. */
export const MAX_SESSIONS = 50;

/**
 * Derive a short title from the first non-empty user message, falling back to
 * "New chat" when the conversation has no user text yet.
 */
export function deriveSessionTitle(messages: readonly ChatMessage[]): string {
  for (const message of messages) {
    if (message.role === "user" && typeof message.content === "string") {
      const text = message.content.replace(/\s+/g, " ").trim();
      if (text.length > 0) {
        return text.length > MAX_TITLE_CHARS ? `${text.slice(0, MAX_TITLE_CHARS - 1)}…` : text;
      }
    }
  }
  return "New chat";
}

/**
 * Insert or replace a session by id, returning the list ordered most-recent
 * first and capped at MAX_SESSIONS (oldest dropped).
 */
export function upsertSession(
  sessions: readonly ChatSession[],
  session: ChatSession,
): ChatSession[] {
  const others = sessions.filter((existing) => existing.id !== session.id);
  return [session, ...others].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSIONS);
}

/** Remove a session by id. */
export function removeSession(sessions: readonly ChatSession[], id: string): ChatSession[] {
  return sessions.filter((session) => session.id !== id);
}

/** Compact relative-time label for the history picker (e.g. "5m ago"). */
export function relativeTime(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
