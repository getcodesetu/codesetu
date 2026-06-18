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
import { describe, expect, it } from "vitest";

import {
  deriveSessionTitle,
  relativeTime,
  removeSession,
  upsertSession,
  type ChatSession,
} from "../src/chatSessions";

const session = (id: string, updatedAt: number): ChatSession => ({
  id,
  title: id,
  updatedAt,
  messages: [],
});

describe("deriveSessionTitle", () => {
  it("uses the first non-empty user message, collapsed", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "  Explain   this\nfunction  " },
      { role: "assistant", content: "sure" },
    ];
    expect(deriveSessionTitle(messages)).toBe("Explain this function");
  });

  it("truncates long titles with an ellipsis", () => {
    const long = "x".repeat(100);
    const title = deriveSessionTitle([{ role: "user", content: long }]);
    expect(title.length).toBe(60);
    expect(title.endsWith("…")).toBe(true);
  });

  it("falls back to New chat with no user text", () => {
    expect(deriveSessionTitle([{ role: "assistant", content: "hi" }])).toBe("New chat");
    expect(deriveSessionTitle([])).toBe("New chat");
  });
});

describe("upsertSession", () => {
  it("replaces by id and orders most-recent first", () => {
    const sessions = [session("a", 100), session("b", 200)];
    const result = upsertSession(sessions, session("a", 300));
    expect(result.map((s) => s.id)).toEqual(["a", "b"]);
    expect(result[0]?.updatedAt).toBe(300);
  });

  it("caps the list at MAX_SESSIONS, dropping the oldest", () => {
    const many = Array.from({ length: 60 }, (_, i) => session(`s${i}`, i));
    const result = upsertSession(many, session("new", 1000));
    expect(result.length).toBe(50);
    expect(result[0]?.id).toBe("new");
    // The oldest (lowest updatedAt) entries are dropped.
    expect(result.some((s) => s.id === "s0")).toBe(false);
  });
});

describe("removeSession", () => {
  it("drops the matching id", () => {
    const result = removeSession([session("a", 1), session("b", 2)], "a");
    expect(result.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("relativeTime", () => {
  it("formats across ranges", () => {
    const now = 10_000_000_000;
    expect(relativeTime(now, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(relativeTime(now - 24 * 3_600_000, now)).toBe("yesterday");
    expect(relativeTime(now - 5 * 24 * 3_600_000, now)).toBe("5d ago");
  });
});
