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

/**
 * Minimal subset of vscode.CancellationToken — kept structural so this module
 * stays free of the `vscode` import and can be unit-tested in isolation.
 */
export interface CancellationLike {
  isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

/**
 * Resolve `true` after `delayMs`, or `false` immediately if the cancellation
 * token fires first — so a debounced request abandons cleanly when superseded.
 */
export function delayUnlessCancelled(delayMs: number, token: CancellationLike): Promise<boolean> {
  if (delayMs <= 0) {
    return Promise.resolve(!token.isCancellationRequested);
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      disposable.dispose();
      resolve(!token.isCancellationRequested);
    }, delayMs);
    const disposable = token.onCancellationRequested(() => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
