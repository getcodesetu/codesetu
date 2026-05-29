# Changelog

All notable changes to CodeSetu will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Added

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

### Planned for v0.1

- Inline FIM completions via Sarvam-30B
- Chat panel for VSCode
- Chat panel for JetBrains (IntelliJ, PyCharm, WebStorm)
- `/edit` command with diff view
- Codebase indexing (`@workspace`)
- On-prem Docker installer

---

<!-- Add new releases above this line -->
