# Installing CodeSetu

This guide covers local development install, VSIX packaging, provider
configuration, and private VSIX distribution.

## Prerequisites

- Node.js 18+ for development builds
- Node.js 20+ for packaging/publishing with the current `@vscode/vsce` CLI
- pnpm 9 via Corepack
- VS Code 1.85+
- One provider:
  - Sarvam API key
  - OpenRouter API key
  - local OpenAI-compatible endpoint such as Ollama, vLLM, or SGLang

## Build from Source

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm build
corepack pnpm test
```

The VS Code extension bundle is created at:

```text
apps/vscode/dist/extension.cjs
```

## Package a VSIX

From the repository root:

```bash
corepack pnpm package:vscode
```

This creates:

```text
artifacts/codesetu-0.0.0.vsix
```

You can also package manually:

```bash
corepack pnpm build
mkdir -p artifacts
cd apps/vscode
corepack pnpm dlx @vscode/vsce package --no-dependencies --out ../../artifacts/codesetu-0.0.0.vsix
```

## Install the VSIX Locally

Command line:

```bash
code --install-extension artifacts/codesetu-0.0.0.vsix
```

VS Code UI:

1. Open Extensions.
2. Select Views and More Actions.
3. Choose Install from VSIX.
4. Select `artifacts/codesetu-0.0.0.vsix`.

Reload VS Code after install.

## Configure Providers

For an installed extension, prefer VS Code settings over `.env` files. Open
Settings JSON and add one of these configurations.

### VS Code guided setup

Run `CodeSetu: Setup Provider` from the command palette, choose Sarvam or
OpenAI-compatible, enter the base URL, model, and API key, then run
`CodeSetu: Diagnose Provider`.

### JetBrains guided setup

Open `Settings -> Tools -> CodeSetu`, enter provider, base URL, model, and API
key, then use the CodeSetu diagnostics action from the Tools menu.

### Sarvam

Set `codesetu.model` to the model id provided by your Sarvam account.

```json
{
  "codesetu.provider": "sarvam",
  "codesetu.apiKey": "YOUR_SARVAM_API_KEY",
  "codesetu.baseUrl": "https://api.sarvam.ai/v1",
  "codesetu.model": "<your-sarvam-model-id>"
}
```

### Ollama

Start Ollama locally and pull a coding model:

```bash
ollama pull qwen2.5-coder:7b
```

Then configure CodeSetu through Ollama's OpenAI-compatible endpoint:

```json
{
  "codesetu.provider": "openai-compatible",
  "codesetu.apiKey": "ollama",
  "codesetu.baseUrl": "http://localhost:11434/v1",
  "codesetu.model": "qwen2.5-coder:7b"
}
```

### OpenRouter

```json
{
  "codesetu.provider": "openai-compatible",
  "codesetu.apiKey": "YOUR_OPENROUTER_API_KEY",
  "codesetu.baseUrl": "https://openrouter.ai/api/v1",
  "codesetu.model": "anthropic/claude-3.5-sonnet"
}
```

### vLLM or SGLang

Point `codesetu.baseUrl` at the server's OpenAI-compatible `/v1` endpoint and
set `codesetu.model` to the served model name.

```json
{
  "codesetu.provider": "openai-compatible",
  "codesetu.apiKey": "local",
  "codesetu.baseUrl": "http://localhost:8000/v1",
  "codesetu.model": "<your-served-model-name>"
}
```

## Smoke Test

1. Open a code file.
2. Run `CodeSetu: Open Chat` from the command palette.
3. Ask a small code question.
4. Place the cursor inside a function and pause to trigger inline completion.
5. If nothing returns, open Output and select the `CodeSetu` channel.

## Private Distribution

For private or enterprise distribution, upload the VSIX from `artifacts/` to an
internal release page, GitHub Release, or artifact store. Users can install it
with `code --install-extension <file>.vsix` or the VS Code Install from VSIX UI.
