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

import { delayUnlessCancelled, type CancellationLike } from "../src/completionDebounce";

function fakeToken(): { token: CancellationLike; cancel(): void } {
  const listeners: Array<() => void> = [];
  const token: CancellationLike = {
    isCancellationRequested: false,
    onCancellationRequested(listener) {
      listeners.push(listener);
      return { dispose: () => undefined };
    },
  };
  return {
    token,
    cancel() {
      token.isCancellationRequested = true;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

describe("delayUnlessCancelled", () => {
  it("resolves true after the delay when not cancelled", async () => {
    const { token } = fakeToken();
    await expect(delayUnlessCancelled(5, token)).resolves.toBe(true);
  });

  it("resolves false immediately when cancelled during the delay", async () => {
    const { token, cancel } = fakeToken();
    const pending = delayUnlessCancelled(1000, token);
    cancel();
    await expect(pending).resolves.toBe(false);
  });

  it("resolves synchronously without a timer when the delay is zero", async () => {
    const { token } = fakeToken();
    await expect(delayUnlessCancelled(0, token)).resolves.toBe(true);
  });

  it("reflects an already-cancelled token with a zero delay", async () => {
    const { token, cancel } = fakeToken();
    cancel();
    await expect(delayUnlessCancelled(0, token)).resolves.toBe(false);
  });
});
