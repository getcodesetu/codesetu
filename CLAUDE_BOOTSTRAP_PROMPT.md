# CodeSetu — Project Bootstrap Prompt

# Paste this into Claude (VSCode) to set up the full project

---

I am building **CodeSetu** — an open-source AI coding assistant plugin for VSCode and JetBrains IDEs.

## What it is

- A fork/extension of **Continue.dev** (Apache 2.0 open-source AI code assistant)
- Uses **Sarvam-30B** as the primary LLM (India's sovereign open-source MoE model, Apache 2.0)
- Supports all 22 Indian scheduled languages in code comments, docstrings, and chat
- Fully deployable on-prem / air-gapped (no code leaves India)
- Built for BFSI, PSUs, government departments, and Indian developers

## Differentiators vs Copilot/Cursor

- Sovereign: runs on Indian infra, code never leaves India
- Indic-language aware: Hindi, Tamil, Bengali, Telugu etc. as first-class
- India Stack native: built-in MCP tools for BHASHINI, ABDM, ONDC, DigiLocker
- Open source: Apache 2.0, forkable, auditable
- On-prem: one Docker command for air-gapped enterprise deployment

## Tech stack

- **Core:** TypeScript (forked from Continue.dev)
- **VSCode extension:** TypeScript, VSCode Extension API
- **JetBrains plugin:** Kotlin, IntelliJ Platform SDK
- **Model backend:** Sarvam-30B via vLLM or SGLang (OpenAI-compatible API)
- **On-prem:** Docker Compose
- **Monorepo:** pnpm workspaces
- **Packages:**
  - `packages/core` — shared logic, provider abstraction, tool-call handling
  - `packages/vscode` — VSCode extension wrapper
  - `packages/jetbrains` — JetBrains plugin wrapper

## Repo structure already created

```
codesetu/
├── README.md
├── LICENSE (Apache 2.0)
├── NOTICE (credits Continue.dev + Sarvam)
├── CONTRIBUTING.md (DCO sign-off, conventional commits)
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── CHANGELOG.md
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/
├── docs/
└── packages/
    ├── core/
    ├── vscode/
    └── jetbrains/
```

## What I need you to do now

### Step 1 — Scaffold the monorepo

Set up `pnpm` workspaces with the following packages:

- `packages/core` — TypeScript lib
- `packages/vscode` — VSCode extension (TypeScript)
- `packages/jetbrains` — placeholder (Kotlin, set up later)

Create root `package.json` with pnpm workspaces config, `tsconfig.json`, `.eslintrc`, `.prettierrc`, `.gitignore`, `.env.example`.

### Step 2 — Set up `packages/core`

Create the core package with:

- `package.json`
- `tsconfig.json`
- `src/providers/sarvam.ts` — Sarvam LLM provider (OpenAI-compatible, points to `https://api.sarvam.ai/v1`)
- `src/providers/base.ts` — base provider interface
- `src/tools/index.ts` — tool-call registry (stub)
- `src/index.ts` — exports

The Sarvam provider must:

- Support chat completions (`/v1/chat/completions`)
- Support FIM completions (`/v1/completions`) for inline suggestions
- Support tool/function calling (Sarvam-30B natively supports this)
- Accept `SARVAM_API_KEY` from env
- Default model: `sarvam-30b`
- Be OpenAI SDK compatible so we can swap providers easily

### Step 3 — Set up `packages/vscode`

Scaffold a basic VSCode extension with:

- `package.json` (with `contributes`, `activationEvents`, `engines.vscode`)
- `src/extension.ts` — activate/deactivate
- `src/completionProvider.ts` — inline completion provider stub
- `src/chatPanel.ts` — webview chat panel stub
- `.vscodeignore`
- Basic `esbuild` or `webpack` bundler config

The extension should:

- Register an inline completion provider
- Register a `CodeSetu: Open Chat` command
- Show a status bar item "CodeSetu: Ready" when activated

### Step 4 — GitHub Actions CI

Create `.github/workflows/ci.yml` that:

- Runs on push and PR to `main`
- Installs pnpm
- Runs `pnpm install`
- Runs `pnpm lint`
- Runs `pnpm build`
- Runs `pnpm test` (even if tests are empty stubs for now)

### Step 5 — Issue templates

Create `.github/ISSUE_TEMPLATE/`:

- `bug_report.md` — includes OS, IDE version, reproduction steps, logs
- `feature_request.md` — includes problem, proposed solution, alternatives
- `question.md` — redirects to Discussions

Create `.github/PULL_REQUEST_TEMPLATE.md` — includes checklist: linked issue, tests, DCO sign-off, screenshots if UI change.

### Step 6 — docs/ARCHITECTURE.md

Write a clear architecture document with:

- ASCII diagram of the full stack (IDE plugin → Core → Sarvam API → model)
- Explanation of each package's responsibility
- How the Sarvam provider works
- How tool-calling flows through the system
- How on-prem deployment differs from hosted

## Constraints

- Apache 2.0 license headers on all source files
- All TypeScript must be strict mode (`"strict": true`)
- No `any` types unless absolutely necessary with a comment explaining why
- Conventional commits for all example commit messages in docs
- DCO sign-off required (mention in CONTRIBUTING.md, already done)
- pnpm only — no npm or yarn
- Node.js 18+ minimum

## After scaffolding

Once the above is done, the next steps (which I'll ask separately) will be:

1. Implement real FIM completions through Sarvam-30B
2. Build the chat panel UI in the VSCode webview
3. Add codebase indexing with pgvector
4. Add India Stack MCP tool integrations
5. Build the JetBrains plugin in Kotlin

Please start with Step 1 and proceed through all steps in order.
Ask me before making any assumptions about API keys, ports, or deployment targets.
