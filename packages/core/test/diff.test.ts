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

import { applyHunks, computeHunks, diffLines } from "../src/index.js";

const OLD = ["one", "two", "three", "four", "five"].join("\n");
const NEW = ["one", "TWO", "three", "four", "FIVE", "six"].join("\n");

describe("computeHunks", () => {
  it("splits non-adjacent changes into separate hunks", () => {
    const hunks = computeHunks(OLD, NEW);
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ oldLines: ["two"], newLines: ["TWO"] });
    // "five" -> "FIVE" plus an appended "six".
    expect(hunks[1]?.oldLines).toEqual(["five"]);
    expect(hunks[1]?.newLines).toEqual(["FIVE", "six"]);
  });

  it("models a pure insertion with empty oldLines", () => {
    const hunks = computeHunks("a\nb", "a\nINSERTED\nb");
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.oldLines).toEqual([]);
    expect(hunks[0]?.newLines).toEqual(["INSERTED"]);
  });

  it("models a pure deletion with empty newLines", () => {
    const hunks = computeHunks("a\ngone\nb", "a\nb");
    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.oldLines).toEqual(["gone"]);
    expect(hunks[0]?.newLines).toEqual([]);
  });

  it("returns no hunks when the texts are identical", () => {
    expect(computeHunks(OLD, OLD)).toEqual([]);
  });
});

describe("applyHunks", () => {
  it("accepting every hunk reproduces the new text", () => {
    const hunks = computeHunks(OLD, NEW);
    const all = hunks.map((_, index) => index);
    expect(applyHunks(OLD, hunks, all)).toBe(NEW);
  });

  it("accepting no hunk reproduces the original text", () => {
    const hunks = computeHunks(OLD, NEW);
    expect(applyHunks(OLD, hunks, [])).toBe(OLD);
  });

  it("applies only the selected hunk", () => {
    const hunks = computeHunks(OLD, NEW);
    // Accept only the second hunk (five -> FIVE + six); first stays "two".
    const result = applyHunks(OLD, hunks, [1]);
    expect(result).toBe(["one", "two", "three", "four", "FIVE", "six"].join("\n"));
  });

  it("applies an insertion-only hunk in place", () => {
    const hunks = computeHunks("a\nb", "a\nINSERTED\nb");
    expect(applyHunks("a\nb", hunks, [0])).toBe("a\nINSERTED\nb");
    expect(applyHunks("a\nb", hunks, [])).toBe("a\nb");
  });
});

describe("diffLines", () => {
  it("prefixes unchanged, removed, and added lines", () => {
    expect(diffLines("a\nb", "a\nc")).toBe(" a\n-b\n+c");
  });
});
