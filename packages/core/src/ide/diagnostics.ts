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

import { createProvider as createConfiguredProvider } from "../providers/registry.js";
import type { DiagnoseProviderOptions, ProviderDiagnostic } from "./types.js";

export async function diagnoseProvider(
  options: DiagnoseProviderOptions = {},
): Promise<ProviderDiagnostic> {
  const providerOptions = options.providerOptions ?? {};
  const configuredModel = providerOptions.model;

  if (configuredModel !== undefined && configuredModel.trim().length === 0) {
    return {
      status: "missing-config",
      message: "model is required before CodeSetu can create the provider.",
    };
  }

  try {
    const createProvider = options.createProvider ?? createConfiguredProvider;
    const provider = createProvider(providerOptions);

    await provider.chat({
      messages: [{ role: "user", content: "Reply with ok." }],
      maxTokens: 8,
      temperature: 0,
    });

    return {
      status: "ok",
      message: "Provider diagnostic chat completed.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Provider diagnostic failed.",
    };
  }
}
