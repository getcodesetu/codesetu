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

export * from "./retrieval/index.js";
export type {
  ChatCompletion,
  ChatCompletionRequest,
  ChatCompletionStream,
  ChatMessage,
  ChatStreamChunk,
  FimCompletionRequest,
  LlmProvider,
} from "./providers/base.js";
export {
  DEFAULT_HUGGINGFACE_BASE_URL,
  DEFAULT_HUGGINGFACE_MODEL,
  DEFAULT_HUGGINGFACE_PROVIDER,
  HuggingFaceProvider,
  type HuggingFaceOpenAIClient,
  type HuggingFaceProviderOptions,
} from "./providers/huggingface.js";
export {
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  DEFAULT_OPENAI_COMPATIBLE_PROVIDER,
  OpenAICompatibleProvider,
  type OpenAICompatibleClient,
  type OpenAICompatibleProviderOptions,
} from "./providers/openaiCompatible.js";
export {
  DEFAULT_PROVIDER_ID,
  createProvider,
  listProviderIds,
  type ConfiguredProvider,
  type ProviderFactoryOptions,
  type ProviderId,
} from "./providers/registry.js";
export { getAssistantText } from "./providers/response.js";
export {
  IDE_ACTIONS,
  buildActionUserMessage,
  buildCodeSetuSystemMessage,
  type SystemMessageOptions,
} from "./ide/actions.js";
export {
  PLAN_MODE_APPROVE_PHRASE,
  PLAN_MODE_SKILL,
  PLAN_MODE_SKILL_ID,
  isPlanModeApproval,
} from "./ide/planMode.js";
export {
  BUILTIN_SKILLS_FALLBACK,
  EXPLAIN_CODE_SKILL,
  INDIC_COMMENTS_SKILL,
  REFACTOR_SKILL,
  WRITE_TESTS_SKILL,
  findBuiltinSkill,
  parseBuiltinSkills,
  routeSkills,
  type BuiltinSkill,
  type ParseBuiltinSkillsResult,
  type RouteSkillsInput,
  type RouteSkillsResult,
} from "./skills/index.js";
export {
  DEFAULT_HUGGINGFACE_SPEECH_BASE_URL,
  DEFAULT_HUGGINGFACE_STT_MODEL,
  DEFAULT_SARVAM_LANGUAGE,
  DEFAULT_SARVAM_SPEECH_BASE_URL,
  DEFAULT_SARVAM_STT_MODEL,
  HuggingFaceSpeechProvider,
  OpenAICompatibleSpeechProvider,
  SPEECH_PROVIDER_IDS,
  SarvamSpeechProvider,
  createSpeechProvider,
  normalizeSpeechProvider,
  type AudioBlob,
  type CreateSpeechProviderResult,
  type HuggingFaceSpeechProviderOptions,
  type OpenAICompatibleSpeechOptions,
  type SarvamSpeechProviderOptions,
  type SpeechFactoryOptions,
  type SpeechProvider,
  type SpeechProviderId,
  type TranscribeOptions,
  type TranscriptionResult,
} from "./speech/index.js";
export { buildContextMarkdown, trimMiddle, type IdeContextMarkdownOptions } from "./ide/context.js";
export { diagnoseProvider } from "./ide/diagnostics.js";
export {
  IDE_ACTION_IDS,
  type DiagnoseProviderOptions,
  type IdeActionId,
  type IdeContextPayload,
  type ProviderDiagnostic,
  type ProviderDiagnosticStatus,
  type RetrievedSnippet,
  type WorkspaceInstruction,
  type WorkspaceInstructionParseResult,
  type WorkspaceInstructionSource,
  type WorkspaceSnippet,
} from "./ide/types.js";
export { parseWorkspaceInstructions } from "./ide/workspaceInstructions.js";
export {
  DEFAULT_SARVAM_BASE_URL,
  DEFAULT_SARVAM_MODEL,
  SarvamProvider,
  type SarvamOpenAIClient,
  type SarvamProviderOptions,
} from "./providers/sarvam.js";
export { listTools, registerTool, type CodeSetuTool } from "./tools/index.js";
export type { AgentHost, DirEntry, ExecOptions, ExecResult } from "./agent/index.js";
export {
  BASH_TOOL,
  DEFAULT_AGENT_TOOLS,
  DEFAULT_BASH_TIMEOUT_MS,
  DEFAULT_MAX_ITERATIONS,
  EDIT_TOOL,
  EMPTY_AGENT_POLICY,
  GLOB_TOOL,
  MAX_DIAGNOSTICS,
  MAX_DIFF_LINES,
  applyHunks,
  computeHunks,
  createBashCommandPolicy,
  diffLines,
  type DiffHunk,
  formatDiagnostics,
  parseAgentPolicy,
  parseToolCallsFromContent,
  GREP_TOOL,
  LIST_TOOL,
  MAX_GLOB_RESULTS,
  MAX_GREP_FILES,
  MAX_GREP_MATCHES,
  MAX_TOOL_OUTPUT_CHARS,
  READ_TOOL,
  TODO_WRITE_TOOL,
  WRITE_TOOL,
  runAgentLoop,
  sanitizeToolMessages,
  type AgentEvent,
  type AgentLoopOptions,
  type AgentLoopResult,
  type AgentTool,
  type AgentToolContext,
  type AgentPolicy,
  type ApprovalDecision,
  type ApprovalRequest,
  type Diagnostic,
  type DiagnosticSeverity,
  type PolicyDecision,
  type StoppedReason,
  type ToolResult,
  type ToolRisk,
} from "./agent/index.js";
