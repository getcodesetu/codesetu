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

import { describe, expect, it } from "vitest";

import { spliceText, stripCodeFences } from "../src/editText";

describe("stripCodeFences", () => {
  it("leaves un-fenced code untouched", () => {
    expect(stripCodeFences("const x = 1;")).toBe("const x = 1;");
  });

  it("strips a language-tagged fence", () => {
    expect(stripCodeFences("```ts\nconst x = 1;\n```")).toBe("const x = 1;");
  });

  it("strips a bare fence", () => {
    expect(stripCodeFences("```\nhello\nworld\n```")).toBe("hello\nworld");
  });

  it("keeps inner triple backticks when only one fence wraps the block", () => {
    expect(stripCodeFences("```md\na ``` b\n```")).toBe("a ``` b");
  });

  it("returns the original when a lone opening fence has no newline", () => {
    expect(stripCodeFences("```ts")).toBe("```ts");
  });
});

describe("spliceText", () => {
  it("replaces the given offset range", () => {
    expect(spliceText("abcdef", 2, 4, "XY")).toBe("abXYef");
  });

  it("inserts when start equals end", () => {
    expect(spliceText("abcdef", 3, 3, "_")).toBe("abc_def");
  });

  it("replaces from the start", () => {
    expect(spliceText("hello world", 0, 5, "goodbye")).toBe("goodbye world");
  });
});
