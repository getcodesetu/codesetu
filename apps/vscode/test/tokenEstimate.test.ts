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

import { estimateTokens, estimateTokensForParts, formatTokenCount } from "../src/tokenEstimate";

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("rounds up to whole tokens at ~4 chars each", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("estimateTokensForParts", () => {
  it("sums each part's estimate independently", () => {
    // "abcd" -> 1, "ef" -> 1; summed per-part (not concatenated) so 2.
    expect(estimateTokensForParts(["abcd", "ef"])).toBe(2);
  });

  it("is zero for no parts", () => {
    expect(estimateTokensForParts([])).toBe(0);
  });
});

describe("formatTokenCount", () => {
  it("shows raw counts under 1000", () => {
    expect(formatTokenCount(0)).toBe("0");
    expect(formatTokenCount(999)).toBe("999");
  });

  it("abbreviates thousands with one decimal", () => {
    expect(formatTokenCount(1000)).toBe("1.0k");
    expect(formatTokenCount(12_300)).toBe("12.3k");
  });
});
