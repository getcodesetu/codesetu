/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Alias the `vscode` module (only present in the real extension host) to an
// in-memory mock so tests like activation.test.ts can run the extension's
// activate() headlessly. Source files keep type-checking against @types/vscode.
export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL("./test-support/vscodeMock.ts", import.meta.url)),
    },
  },
});
