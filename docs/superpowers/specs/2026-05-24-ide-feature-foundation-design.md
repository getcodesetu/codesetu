# CodeSetu IDE Feature Foundation Design

Date: 2026-05-24
Branch: `codex-ide-feature-foundation`

## Summary

CodeSetu will add five user-facing feature groups across the VS Code and
JetBrains plugins:

1. Real JetBrains chat.
2. Repo-aware context for chat and commands.
3. Selected-code actions for common coding tasks.
4. Provider setup and diagnostics.
5. Skills and checks loaded from the workspace.

The implementation should make the two IDE plugins feel consistent without
forcing JetBrains users to install Node.js or run a sidecar service. Shared
behavior will be expressed as a small, language-neutral IDE assistant contract:
context payloads, action ids, prompt templates, provider setting names, and
skill/check file conventions. VS Code will implement the contract in
TypeScript. JetBrains will implement the same contract in Kotlin.

## Goals

- Bring the JetBrains plugin from early scaffold status to a usable chat tool
  window.
- Make both plugins understand useful editor context: selection, active file,
  language id, cursor neighborhood, and bounded workspace file search.
- Add explicit selected-code actions in both IDEs: Explain, Refactor, Write
  Tests, Fix Bug, and Add Docs.
- Give users a provider setup and diagnostics flow for Sarvam and generic
  OpenAI-compatible endpoints.
- Let teams define reusable workspace skills and checks under `.codesetu/`.
- Keep the first release safe and reviewable: commands produce chat responses
  and proposed changes, not automatic file edits.

## Non-Goals

- No fully autonomous multi-file agent in this phase.
- No semantic vector index in this phase.
- No background daemon or Node.js dependency for the JetBrains plugin.
- No automatic execution of model-generated shell commands or tool calls.
- No marketplace publishing changes beyond docs and package metadata required
  for the new features.

## Architecture

### Shared IDE Assistant Contract

The shared contract defines stable names and payload shapes:

- `IdeContextPayload`: active file path, language id, selected text, full active
  file text when allowed, cursor prefix/suffix, and related workspace snippets.
- `IdeActionId`: `explain`, `refactor`, `write-tests`, `fix-bug`, `add-docs`.
- `ProviderDiagnostic`: configured provider, base URL, model, API key presence,
  reachability status, latency, and error message.
- `WorkspaceSkill`: id, name, description, source path, and markdown body.
- `WorkspaceCheck`: id, name, description, source path, and markdown body.

In TypeScript these live in `packages/core` so VS Code can import them directly.
In Kotlin they are mirrored as data classes inside `apps/jetbrains`. The
contract stays simple enough that parity can be tested with shared JSON fixture
files.

### VS Code Plugin

VS Code keeps the existing chat webview and inline completion provider, then
adds:

- Context collection from the active editor, selection, cursor neighborhood,
  and workspace file search.
- Commands for each selected-code action.
- A provider setup command with validation and a diagnostic command.
- Skill/check discovery from `.codesetu/skills/*.md` and
  `.codesetu/checks/*.md`.
- Chat rendering improvements needed for command output and diagnostics.

### JetBrains Plugin

JetBrains adds a real IntelliJ Platform tool window:

- A chat panel with transcript, input box, send button, loading/error states,
  and project-aware message handling.
- Kotlin provider clients for Sarvam and OpenAI-compatible chat completions.
- Settings UI using IntelliJ persistent state for provider, base URL, model,
  and API key presence.
- Editor actions for Explain, Refactor, Write Tests, Fix Bug, and Add Docs.
- Project context collection using IntelliJ editor and virtual file APIs.
- Skill/check discovery from `.codesetu/skills/*.md` and
  `.codesetu/checks/*.md`.

## Data Flow

### Chat

1. User opens chat in VS Code or JetBrains.
2. Host collects a bounded `IdeContextPayload` from the active project.
3. Host loads enabled workspace skills/checks.
4. Host builds system and user messages using the shared prompt contract.
5. Host sends the request to the configured provider.
6. Host renders the assistant response in the chat transcript.

### Selected-Code Action

1. User selects code and runs one of the CodeSetu actions.
2. Host builds an action prompt using the selected text, file metadata, and
   nearby context.
3. Provider returns an explanation, review, or patch-style suggestion.
4. Host displays the result in chat. Applying edits remains manual in this
   phase.

### Provider Diagnostics

1. User runs diagnostics or clicks Test Connection in setup.
2. Host checks whether provider settings are complete.
3. Host sends a small low-token request to the provider when settings allow it.
4. Host reports success, latency, model, base URL, or a concise remediation
   message.

## Skills and Checks

Workspace-authored files use markdown with simple YAML frontmatter.

Skills:

```markdown
---
id: spring-reviewer
name: Spring Reviewer
description: Review Spring Boot code for maintainability and correctness.
---

Use this guidance when reviewing Spring Boot services for dependency
injection, transaction boundaries, validation, and maintainable controller
logic.
```

Checks:

```markdown
---
id: security-review
name: Security Review
description: Look for injection, secret handling, and auth issues.
---

Review the provided code and return findings ordered by severity, with a short
description, affected file context, and a concrete remediation.
```

Invalid files are skipped with a warning in the host output/log. Duplicate ids
are resolved by keeping the first discovered file and warning about the rest.

## Error Handling

- Missing model or API key: show setup guidance instead of sending a request.
- Provider timeout or network failure: show a concise error in chat and log the
  detailed error to the host output/log.
- Unsupported provider: show supported providers and link to setup.
- Oversized context: trim workspace snippets first, then active file text, while
  preserving selected text.
- Invalid skill/check file: skip it, warn once, and keep chat usable.
- JetBrains secure storage failure: fall back to prompting the user to re-enter
  the API key and avoid logging secret values.

## Privacy and Safety

- Requests include only bounded editor/workspace context assembled for the
  current user action.
- Workspace snippets respect ignored and excluded paths where each IDE exposes
  that information.
- API keys are never included in chat prompts, logs, diagnostics transcripts, or
  generated markdown.
- Model responses are suggestions only in this phase. CodeSetu does not apply
  edits or execute commands automatically.

## Testing

Core TypeScript tests:

- Context trimming preserves selected text.
- Prompt builders produce stable action messages.
- Skill/check markdown parsing accepts valid frontmatter and rejects invalid
  files.
- Provider diagnostics classify missing config, success, and provider errors.

VS Code tests:

- Commands are contributed and route to the expected action ids.
- Chat receives context-aware messages.
- Diagnostics surface friendly errors.

JetBrains tests:

- Settings state persists provider configuration.
- Provider client serializes OpenAI-compatible chat requests correctly.
- Action handlers collect editor selection and open chat with generated output.
- Skill/check discovery reads project files and handles invalid markdown.

Manual verification:

- VS Code: build, test, launch Extension Development Host, verify chat,
  selected-code actions, setup, diagnostics, and skill/check loading.
- JetBrains: run Gradle tests, build plugin, run sandbox IDE, verify chat,
  selected-code actions, setup, diagnostics, and skill/check loading.

## Implementation Order

1. Add shared TypeScript contract, prompt builders, context helpers, diagnostics
   helpers, and skill/check parser tests.
2. Upgrade VS Code chat, commands, setup, diagnostics, and skill/check loading.
3. Add JetBrains settings, provider clients, chat tool window, context
   collector, actions, diagnostics, and skill/check loading.
4. Update README, JetBrains README, install docs, and architecture docs.
5. Run full TypeScript and Gradle verification.
