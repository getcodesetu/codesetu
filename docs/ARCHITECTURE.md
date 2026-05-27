# CodeSetu Architecture

CodeSetu is a pnpm + Gradle monorepo organized around three concerns: **shipped
products** (`apps/`), **publishable libraries** (`packages/`), and **extension
content** (`skills/`, `plugins/`).

## Repository layout

```text
codesetu/
├── apps/                       # Shipped end-user products
│   ├── vscode/                 # VSCode extension (TypeScript + esbuild)
│   └── jetbrains/              # JetBrains plugin (Kotlin + Gradle, planned)
├── packages/                   # Reusable libraries publishable to npm (@codesetu/*)
│   ├── core/                   # Provider abstraction, providers, tool registry
│   └── plugin-sdk/             # Plugin + skill type contracts and host capabilities
├── skills/                     # AI skill manifests (SKILL.md per skill)
├── plugins/                    # First-party plugins built on plugin-sdk
├── docs/                       # Architecture, publishing, contributor docs
└── scripts/                    # Repo-level tooling (build, release, codegen)
```

### apps/

Shipped products consumed by end users. Apps are **not** published to npm — they
are bundled and distributed through their native channel (Marketplace, JetBrains
Marketplace, GitHub Releases). They depend on `packages/*` via workspace links.

### packages/

Libraries published to npm under the `@codesetu/*` scope. Apps and plugins both
consume them. Versioning is independent per package (driven by changesets when
the project starts releasing).

### skills/

Each subdirectory is one skill. A skill is a markdown file with YAML frontmatter
(`SKILL.md`) that the assistant can opt into when routing decides the user's
intent matches. See [../skills/README.md](../skills/README.md).

### plugins/

First-party plugins. Each is a workspace package that depends on
`@codesetu/plugin-sdk` and exports a `CodeSetuPlugin`. Third-party plugins
follow the same shape but live outside this repo and are installed via npm.
See [../plugins/README.md](../plugins/README.md).

## Data flow

```text
+--------------------+      +--------------------+      +--------------------+
| apps/vscode        |      | apps/jetbrains     |      | plugins/*          |
| (Extension Host)   |      | (IntelliJ Plugin)  |      | (workspace pkgs)   |
+----------+---------+      +----------+---------+      +----------+---------+
           |                           |                           |
           +-------------+-------------+-------------+-------------+
                         |                           |
                         v                           v
              +----------+-----------+    +----------+-----------+
              | @codesetu/core       |    | @codesetu/plugin-sdk |
              | - LlmProvider iface  |    | - PluginManifest     |
              | - SarvamProvider     |    | - PluginContext      |
              | - OpenAICompatible   |    | - SkillManifest      |
              | - Tool registry      |    | - HostCapabilities   |
              +----------+-----------+    +----------+-----------+
                         |
                         v
              +----------+-----------+
              | OpenAI-compatible    |
              | HTTP API             |
              | (Sarvam / vLLM /     |
              |  SGLang / Ollama /   |
              |  OpenRouter)         |
              +----------------------+
                         |
                         v
              +----------+-----------+
              | Model served by the  |
              | configured provider  |
              +----------------------+
```

## packages/core

Owns provider interfaces, the provider factory, hosted and local model clients,
response helpers, and the tool-call registry. Apps and plugins should depend on
`@codesetu/core` instead of calling model APIs directly.

Current providers:

- `sarvam` — Sarvam's hosted or compatible local API
- `openai-compatible` — generic OpenAI-compatible provider for vLLM, SGLang,
  Ollama, OpenRouter, or compatible hosted endpoints

Both providers use the OpenAI JavaScript SDK with a configurable `baseURL`,
which keeps apps independent from provider-specific transport code.

Default configuration:

- API key: `SARVAM_API_KEY`
- base URL: `SARVAM_BASE_URL` or `https://api.sarvam.ai/v1`
- model: `SARVAM_MODEL` (must be set — no default; CodeSetu does not ship tied to a specific Sarvam model)
- generic provider env: `CODESETU_API_KEY`, `CODESETU_BASE_URL`, `CODESETU_MODEL`

Chat uses `/v1/chat/completions`. Fill-in-the-middle inline completion uses
`/v1/completions` with `prompt` and `suffix` fields.

## packages/plugin-sdk

Type-only SDK consumed by plugins. Exposes:

- `PluginManifest` — static metadata loaded before activation
- `CodeSetuPlugin` — runtime contract with `activate(ctx)` / `deactivate()`
- `PluginContext` — capabilities passed at activation (register tools,
  providers, skills; subscribe to deactivate)
- `HostCapabilities` — what the embedding host (VSCode, JetBrains, CLI)
  exposes: workspace I/O, UI surfaces, secrets, logger
- `SkillManifest` — runtime representation of a parsed SKILL.md

Host implementations (in `apps/*`) construct a `HostCapabilities` object and a
`PluginContext` and call each plugin's `activate`.

## apps/vscode

Registers:

- `CodeSetu: Open Chat` command
- Selected-code commands for Explain, Refactor, Write Tests, Fix Bug, and Add
  Docs
- Provider setup and diagnostics commands
- `CodeSetu: Ready` status bar item
- File-scheme inline completion provider

The chat webview posts user messages to the extension host. The host reads
VSCode settings, creates the configured provider via `@codesetu/core`, calls
chat completions with bounded IDE context, extracts the assistant text, and
posts the response back.

Inline completions build a bounded FIM context around the cursor, call the
provider's completions endpoint, and return a VSCode `InlineCompletionItem`.

## apps/jetbrains

Kotlin/Gradle plugin with a CodeSetu tool window, provider-backed chat,
selected-code actions, provider settings, and diagnostics. JetBrains mirrors the
shared IDE assistant contract in Kotlin so it can run without a Node.js sidecar.
JetBrains is **not** part of the pnpm workspace — it has its own Gradle build.

## IDE feature foundation

CodeSetu hosts share a language-neutral IDE assistant contract:

- action ids for Explain, Refactor, Write Tests, Fix Bug, and Add Docs
- bounded editor context with selection, active file, cursor neighborhood, and
  workspace snippets
- provider diagnostics with missing-config, ok, and error states
- workspace skills and checks loaded from `.codesetu/skills/*.md` and
  `.codesetu/checks/*.md`

VSCode imports the TypeScript implementation from `@codesetu/core`. JetBrains
mirrors the same payload shapes in Kotlin so it can run without a Node.js
sidecar.

## Tool calling

Tool definitions live in the core tool registry. Intended flow:

1. App asks core for a chat completion.
2. Core attaches registered tool definitions to the chat request.
3. Model returns either a normal assistant message or tool-call requests.
4. Core dispatches approved tool calls and captures results.
5. Core sends tool results back to the model for the final answer.
6. App renders the final response.

Tool execution stays inside explicit registries so hosted and on-prem
deployments can choose which integrations are enabled. Plugins add tools via
`PluginContext.registerTool`.

## Skills and plugins

Skills are content (markdown). Plugins are code. They compose:

- A plugin can register a tool, a provider, **and** a skill in its `activate`.
- A skill can require specific tools (declared in `requiredTools`); the host
  refuses to activate a skill if its required tools aren't registered.

The host's "router" decides per-turn which skills to surface to the model. The
router is part of `@codesetu/core` (TBD), not the SDK — plugins don't implement
routing.

## Hosted and on-prem deployment

Hosted mode points the provider at Sarvam's public OpenAI-compatible API and
uses `SARVAM_API_KEY`.

On-prem mode points `SARVAM_BASE_URL` at an internal vLLM or SGLang service.
Apps and `@codesetu/core` do not change; only environment configuration and
deployment wiring differ.

Air-gapped deployments disable hosted endpoints, configure local model serving,
and restrict tool registries to integrations approved for the network.

## Versioning and publishing

- Apps publish to their native marketplaces (see [PUBLISHING.md](PUBLISHING.md)).
- Packages publish to npm under `@codesetu/*`, versioned independently via
  changesets (to be set up before first release).
- Skills and plugins inside this repo follow the package version they ship with.
