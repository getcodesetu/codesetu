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

import { toSearchGlob } from "../src/pinnedFiles";

describe("toSearchGlob", () => {
  it("matches everything for an empty query", () => {
    expect(toSearchGlob("")).toBe("**/*");
  });

  it("wraps a plain query in a recursive substring glob", () => {
    expect(toSearchGlob("config")).toBe("**/*config*");
  });

  it("keeps path-like characters so folder fragments still match", () => {
    expect(toSearchGlob("src/util")).toBe("**/*src/util*");
  });

  it("strips glob metacharacters that could break the pattern", () => {
    expect(toSearchGlob("a*b?{c}")).toBe("**/*abc*");
  });

  it("collapses to match-all when the query is only metacharacters", () => {
    expect(toSearchGlob("**")).toBe("**/*");
  });
});
