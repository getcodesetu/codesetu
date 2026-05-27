# CodeSetu

> **Open-source AI coding assistant for VSCode and JetBrains. Multi-provider, self-hostable, made in India.**

[![CI](https://github.com/getcodesetu/codesetu/actions/workflows/ci.yml/badge.svg)](https://github.com/getcodesetu/codesetu/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/sjVKU8cpC6)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A **Copilot / Cursor alternative** designed for Indian developers, enterprises, public sector teams, and air-gapped deployments. Bring your own model — CodeSetu works with **Sarvam, OpenAI-compatible APIs (Ollama, vLLM, OpenRouter, SGLang)**, and local self-hosted deployments. AI chat, repo-aware context, selected-code actions, inline FIM completions, tool-calling, and an extensible plugin and skill system across VSCode and JetBrains.

**Highlights**: AI chat in IDE · Repo-aware context · Selected-code actions · Inline (FIM) code completions · Provider setup and diagnostics · Workspace skills/checks · Air-gapped friendly · Hindi / Indic-aware · Plugin + skill SDK · 100% open-source (Apache 2.0)

## Status

This repository is a pnpm + Gradle monorepo organized as:

- `apps/vscode` — VSCode extension with chat, repo-aware context, selected-code actions, setup diagnostics, and inline completions
- `apps/jetbrains` — JetBrains plugin with chat, selected-code actions, provider settings, and diagnostics
- `packages/core` — shared providers, provider factory, and tool-call registry (`@codesetu/core`)
- `packages/plugin-sdk` — plugin and skill type contracts for first- and third-party extensions (`@codesetu/plugin-sdk`)
- `skills/` — AI skill manifests (`SKILL.md` per skill) loaded by hosts at activation
- `plugins/` — first-party plugins built on `@codesetu/plugin-sdk`
- `docs/ARCHITECTURE.md` — full architecture, layout, and deployment notes

## Prerequisites

- Node.js 18+
- pnpm 9+
- A provider — Sarvam API key, OpenRouter key, or a local OpenAI-compatible endpoint (Ollama, vLLM, SGLang)

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

- `codesetu.provider` - `sarvam` or `openai-compatible`
- `codesetu.apiKey` - optional provider API key
- `codesetu.baseUrl` - optional OpenAI-compatible base URL
- `codesetu.model` - optional model name
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
