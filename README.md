# CodeSetu

> **Open-source AI coding assistant for VSCode and JetBrains. Multi-provider, self-hostable, made in India.**

[![CI](https://github.com/getcodesetu/codesetu/actions/workflows/ci.yml/badge.svg)](https://github.com/getcodesetu/codesetu/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/sjVKU8cpC6)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A **Copilot / Cursor alternative** designed for Indian developers, enterprises, public sector teams, and air-gapped deployments. Bring your own model — CodeSetu works with **Sarvam, Hugging Face (any served chat model, dedicated endpoints, or self-hosted TGI), OpenAI-compatible APIs (Ollama, vLLM, OpenRouter, SGLang)**, and local self-hosted deployments. AI chat, repo-aware context, selected-code actions, inline FIM completions, tool-calling, and an extensible plugin and skill system across VSCode and JetBrains.

**Highlights**: AI chat in IDE · Repo-aware context · Selected-code actions · Inline (FIM) code completions · **Agent Mode** (reads, edits, and runs commands with your approval) · **Plan Mode** (plan-then-implement) · **AI Skills with slash palette** (`/plan`, `/explain`, `/refactor`, `/test`, `/indic`) · **Voice dictation** (Sarvam Saarika, browser SpeechRecognition, OpenAI-compatible Whisper, HuggingFace) · Provider setup and diagnostics · Workspace skills/checks · Air-gapped friendly · Hindi / Indic-aware · Plugin + skill SDK · 100% open-source (Apache 2.0)

## Status

This repository is a pnpm + Gradle monorepo organized as:

- `apps/vscode` — VSCode extension with chat, repo-aware context, selected-code actions, setup diagnostics, and inline completions
- `apps/jetbrains` — JetBrains plugin with chat, selected-code actions, provider settings, and diagnostics
- `packages/core` — shared providers, provider factory, and tool-call registry (`@codesetu/core`)
- `packages/plugin-sdk` — plugin and skill type contracts for first- and third-party extensions (`@codesetu/plugin-sdk`)
- `skills/` — AI skill manifests (`SKILL.md` per skill) loaded by hosts at activation
- `plugins/` — first-party plugins built on `@codesetu/plugin-sdk`
- `docs/ARCHITECTURE.md` — full architecture, layout, and deployment notes
- `docs/RELEASE_NOTES.md` — human-friendly highlights of what's new each release

## Agent Mode

Toggle **Agent** in the chat composer to let CodeSetu act, not just chat: it
reads, edits, and runs commands in a tool-calling loop until the task is done,
then you review the result. Plain chat is unchanged when Agent is off.

**Tools**: `read_file`, `write_file`, `edit_file`, `bash`, plus read-only
helpers `list_dir`, `glob`, `grep`, `todo_write`, and IDE-native
`get_diagnostics` (with `find_symbol` / `find_references` in VSCode).

**Approval & safety**: file edits and shell commands require your approval
(Approve / Approve for session / Deny), and edits show a diff before they run.
Read-only tools run without prompting. Hit **Stop** to cancel a run.

**Project policy** — drop a committable `.codesetu/agent.json` in the repo to
share one approval policy across your team:

```json
{
  "maxIterations": 16,
  "autoApproveCommands": ["^git (status|diff|log)\\b", "^npm (test|run lint)$"],
  "denyCommands": ["rm\\s+-rf", "\\bsudo\\b", "\\bcurl\\b"]
}
```

Patterns are regular expressions matched against the shell command.
`denyCommands` block a command outright (deny wins), `autoApproveCommands` run
without a prompt, and anything else asks. `maxIterations` caps the agent loop.

## Prerequisites

- Node.js 18+
- pnpm 9+
- A provider — Sarvam API key, a Hugging Face token (`hf_…`), OpenRouter key, or a local OpenAI-compatible endpoint (Ollama, vLLM, SGLang)

## Setup

```bash
corepack pnpm install
cp .env.example .env
corepack pnpm build
corepack pnpm test
```

Set `SARVAM_API_KEY` in `.env` before making real hosted Sarvam requests. For
local OpenAI-compatible servers, set `CODESETU_PROVIDER=openai-compatible`,
`CODESETU_BASE_URL`, and `CODESETU_MODEL`.

For local install and provider examples, see [INSTALL.md](INSTALL.md). For
Marketplace, Open VSX, and private VSIX hosting, see
[docs/PUBLISHING.md](docs/PUBLISHING.md).

## VSCode Settings

The VSCode extension reads these settings:

- `codesetu.provider` - `sarvam`, `openai-compatible`, or `huggingface`
- `codesetu.baseUrl` - optional base URL (e.g. `https://router.huggingface.co/v1`, a dedicated HF endpoint, or a local server)
- `codesetu.model` - optional model name (for Hugging Face, the model repo id, e.g. `meta-llama/Llama-3.3-70B-Instruct`)
- API key — set via the **CodeSetu: Setup Provider** command (stored in the OS secret store), or the `SARVAM_API_KEY` / `HF_TOKEN` / `CODESETU_API_KEY` environment variables
- `codesetu.inlineCompletions.enabled` - enable FIM inline completions
- `codesetu.chat.maxTokens` / `codesetu.chat.temperature`

## Development

```bash
corepack pnpm lint
corepack pnpm build
corepack pnpm test
```

Open this repository in VSCode and press `F5` from the extension workspace to
launch an Extension Development Host after the scaffold is expanded with debug
configuration.

## Community

- [Discord](https://discord.gg/sjVKU8cpC6) — chat with users and maintainers
- [GitHub Discussions](https://github.com/getcodesetu/codesetu/discussions) — design questions, RFCs, longer-form
- [GitHub Issues](https://github.com/getcodesetu/codesetu/issues) — bugs and feature requests
- Security: see [SECURITY.md](SECURITY.md) for private vulnerability reporting

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
