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

import type { AgentTool } from "../agent/tools.js";
import { DEFAULT_RETRIEVAL_K, retrieveFromWorkspace } from "./retriever.js";
import type { WorkspaceIndex } from "./store.js";
import type { EmbeddingProvider, RetrievedChunk } from "./types.js";

/** Cap the tool's output so one call can't blow the model's context window. */
const MAX_SEARCH_OUTPUT_CHARS = 12_000;

export interface SearchWorkspaceToolOptions {
  index: WorkspaceIndex;
  provider: EmbeddingProvider;
  defaultK?: number;
}

/**
 * Build a safe `search_workspace` agent tool over a prebuilt index. Lets the
 * agent retrieve semantically-relevant code by meaning instead of burning
 * iterations on grep/glob guesses. Returned only when an index is available, so
 * the tool is absent (rather than failing) on an unindexed workspace.
 */
export function createSearchWorkspaceTool(options: SearchWorkspaceToolOptions): AgentTool {
  const defaultK = Math.max(1, options.defaultK ?? DEFAULT_RETRIEVAL_K);
  return {
    name: "search_workspace",
    description:
      "Semantic search over the indexed workspace. Given a natural-language query " +
      "(e.g. 'where do we validate the auth token'), returns the most relevant code " +
      "chunks as path:startLine-endLine plus the snippet. Prefer this over grep when " +
      "you don't know the exact text to match.",
    risk: "safe",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", description: "Natural-language description of what to find." },
        k: { type: "number", description: `Max results to return (default ${defaultK}).` },
      },
    },
    async execute(args) {
      const query = args.query;
      if (typeof query !== "string" || query.trim().length === 0) {
        return { content: 'Missing required string argument "query".', isError: true };
      }
      const k = typeof args.k === "number" && Number.isFinite(args.k) ? Math.max(1, args.k) : defaultK;
      let hits: RetrievedChunk[];
      try {
        hits = await retrieveFromWorkspace(options.index, options.provider, query, { k });
      } catch (error) {
        return {
          content: `Workspace search failed: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
      if (hits.length === 0) {
        return { content: "No indexed matches. The workspace index may be empty — fall back to grep/glob." };
      }
      const formatted = hits
        .map((hit) => `${hit.path}:${hit.startLine}-${hit.endLine} (score ${hit.score.toFixed(3)})\n${hit.text}`)
        .join("\n\n");
      const capped =
        formatted.length <= MAX_SEARCH_OUTPUT_CHARS
          ? formatted
          : `${formatted.slice(0, MAX_SEARCH_OUTPUT_CHARS)}\n... [truncated]`;
      return { content: capped };
    },
  };
}
