# Changelog

All notable changes to CodeSetu will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Planned for v0.1

- Inline FIM completions via Sarvam-30B
- Chat panel for VSCode
- Chat panel for JetBrains (IntelliJ, PyCharm, WebStorm)
- `/edit` command with diff view
- Codebase indexing (`@workspace`)
- On-prem Docker installer

---

## [0.4.1] - 2026-06-18

### Added

- **Inline completion polish** (VSCode): inline FIM completions are now
  debounced (`codesetu.inlineCompletions.debounceMs`, default 200ms), abandon
  superseded requests on cancellation, and reuse a one-entry cache so
  re-triggering at the same spot avoids a redundant model call.
- **Code-block actions in chat** (VSCode): every fenced code block in an
  assistant reply gets **Copy** and **Insert** buttons — Insert drops the code
  into the editor the user was last in (replacing the selection if any).
- **@-mention file pinning** (VSCode): type `@` in the composer to pin
  workspace files as primary context. Pins show as removable chips, persist
  across turns/reloads, and are sent as a dedicated "pinned files" section
  (distinct from auto-collected snippets).
- **Edit with CodeSetu** (VSCode): new `codesetu.editSelection` command
  (selection context menu + palette) — describe a change, preview it as a
  native diff, and apply via a WorkspaceEdit only on accept.
- **Agent Mode checkpoints** (VSCode): each agent turn snapshots the files it
  writes; **CodeSetu: Revert Last Agent Edits** restores them in one click
  (rewriting modified files, deleting newly created ones). `bash` side effects
  are out of scope.
- **Conversation persistence** (VSCode): the chat transcript is saved per
  workspace and restored on reload; a **New chat** action (composer menu +
  `codesetu.newChat`) clears it.
- **Context-usage gauge** (VSCode): a "~N ctx" chip by the model picker shows
  the estimated tokens in the assembled context for each turn.
- **Agent Mode** (VSCode + JetBrains): an opt-in composer toggle that turns chat
  into a tool-calling agent which reads, edits, and runs commands to complete a
  task. Tools: `read_file`, `write_file`, `edit_file`, `bash`, read-only
  `list_dir` / `glob` / `grep` / `todo_write`, and IDE-native `get_diagnostics`
  (plus `find_symbol` / `find_references` in VSCode). File edits and shell
  commands require approval (with a diff preview for edits); read-only tools are
  auto-approved; a **Stop** button cancels a run; tool context persists across
  turns. A committable `.codesetu/agent.json` sets project policy —
  `autoApproveCommands`, `denyCommands` (regex, deny wins), and `maxIterations`.
- **Plan Mode** in the chat (VSCode + JetBrains): composer toggle that asks the
  assistant for a numbered plan with clarifying questions instead of code
  edits, plus an "Approve & Run" button that sends the canonical approval
  phrase and exits the mode.
- **AI Skills runtime** with a deterministic router (pinned + slash + keyword,
  capped at one auto-routed skill per turn) and a slash-command palette in the
  composer (`/plan`, `/explain`, `/refactor`, `/test`, `/indic`). Workspace
  `.codesetu/skills/*.md` continue to load always-on — no regression.
- **Voice dictation (STT)** with four backends — `browser` (WebSpeech),
  `sarvam` (Saarika), `openai-compatible` (Whisper-style), `huggingface`. Mic
  button with idle / listening / transcribing states; push-to-toggle, hold for
  push-to-talk, spacebar hotkey when the composer is empty. New
  `CodeSetu: Setup Speech Provider` command in VSCode and matching action in
  JetBrains. JetBrains defaults to `sarvam` because browser SpeechRecognition
  does not work in JCEF.
- JetBrains plugin registers a `JBCefAppRequiredArgumentsProvider` that adds
  the CEF flags required for `getUserMedia` to work in the chat webview. See
  `apps/jetbrains/README.md` for the security trade-off.

### Changed

- `buildCodeSetuSystemMessage` (TS) / `buildSystemMessage` (Kotlin) now accept
  `pinnedSkills` and append them after workspace instructions. Existing
  callers unaffected.
- Chat webview CSP tightened with explicit `media-src 'self' blob:` and an
  allowlisted `connect-src` derived from the configured speech endpoints,
  instead of being unconstrained.

---

<!-- Add new releases above this line -->
