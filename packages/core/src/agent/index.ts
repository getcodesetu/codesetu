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

export type { AgentHost, DirEntry, ExecOptions, ExecResult } from "./host.js";
export { MAX_DIFF_LINES, diffLines, computeHunks, applyHunks, type DiffHunk } from "./diff.js";
export {
  MAX_DIAGNOSTICS,
  formatDiagnostics,
  type Diagnostic,
  type DiagnosticSeverity,
} from "./diagnostics.js";
export {
  EMPTY_AGENT_POLICY,
  createBashCommandPolicy,
  parseAgentPolicy,
  type AgentPolicy,
  type PolicyDecision,
} from "./policy.js";
export {
  BASH_TOOL,
  buildAgentToolsPrompt,
  DEFAULT_AGENT_TOOLS,
  DEFAULT_BASH_TIMEOUT_MS,
  EDIT_TOOL,
  GLOB_TOOL,
  GREP_TOOL,
  LIST_TOOL,
  MAX_GLOB_RESULTS,
  MAX_GREP_FILES,
  MAX_GREP_MATCHES,
  MAX_TOOL_OUTPUT_CHARS,
  READ_TOOL,
  TODO_WRITE_TOOL,
  WRITE_TOOL,
  type AgentTool,
  type AgentToolContext,
  type ToolResult,
  type ToolRisk,
} from "./tools.js";
export {
  DEFAULT_MAX_ITERATIONS,
  parseToolCallsFromContent,
  runAgentLoop,
  sanitizeToolMessages,
  type AgentEvent,
  type AgentLoopOptions,
  type AgentLoopResult,
  type ApprovalDecision,
  type ApprovalRequest,
  type StoppedReason,
} from "./loop.js";
