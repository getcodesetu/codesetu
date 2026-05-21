# CodeSetu

CodeSetu is an open-source AI coding assistant for VSCode and JetBrains IDEs,
built around Sarvam-30B and designed for Indian developers, enterprises, public
sector teams, and air-gapped deployments.

## Status

This repository is a pnpm + Gradle monorepo organized as:

- `apps/vscode` — VSCode extension with chat and inline completion flows
- `apps/jetbrains` — placeholder for the future Kotlin plugin (Gradle, outside the pnpm graph)
- `packages/core` — shared providers, provider factory, and tool-call registry (`@codesetu/core`)
- `packages/plugin-sdk` — plugin and skill type contracts for first- and third-party extensions (`@codesetu/plugin-sdk`)
- `skills/` — AI skill manifests (`SKILL.md` per skill) loaded by hosts at activation
- `plugins/` — first-party plugins built on `@codesetu/plugin-sdk`
- `docs/ARCHITECTURE.md` — full architecture, layout, and deployment notes

## Prerequisites

- Node.js 18+
- pnpm 9+
- A Sarvam API key for hosted model calls

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

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
