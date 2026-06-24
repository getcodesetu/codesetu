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

import { mentionsWorkspace } from "../src/workspaceIndex";

describe("mentionsWorkspace", () => {
  it("detects @workspace at the start or mid-message", () => {
    expect(mentionsWorkspace("@workspace where is auth handled")).toBe(true);
    expect(mentionsWorkspace("explain @workspace token flow")).toBe(true);
    expect(mentionsWorkspace("@WORKSPACE please")).toBe(true);
  });

  it("ignores look-alikes and plain text", () => {
    expect(mentionsWorkspace("workspace settings")).toBe(false);
    expect(mentionsWorkspace("email me at foo@workspaces.io")).toBe(false);
    expect(mentionsWorkspace("just a normal question")).toBe(false);
  });
});
