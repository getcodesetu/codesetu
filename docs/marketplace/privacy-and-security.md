# Privacy & Security

CodeSetu is positioned for Indian developers, enterprises, public-sector teams,
and air-gapped deployments — so privacy and security aren't an afterthought.
This page describes exactly what the plugin does with your data and your keys.

---

## API keys

- Stored in the OS **PasswordSafe** (the IntelliJ Platform CredentialStore that
  wraps macOS Keychain / Windows Credential Manager / KWallet / Secret Service).
- **Never** written to the plugin settings XML in plaintext.
- A one-time migration moves any legacy plaintext key out of the settings XML
  into PasswordSafe on first run after upgrade.
- You can also supply keys via environment variables (`SARVAM_API_KEY`,
  `HF_TOKEN`, `CODESETU_API_KEY`) if you prefer not to enter them into the IDE
  at all.

## Where your prompts go

- Your prompts and your IDE context are sent **only to the provider you
  configured** (the `Base URL` in CodeSetu settings). Nothing is sent to
  CodeSetu maintainers.
- The plugin makes **no other network calls**. There is no telemetry, no
  metrics service, no usage beacon.

## What gets sent as "context"

When **Include IDE context** is on (toggleable per message via the `+` menu in
the composer), each message includes:

- The path, language, and contents of the **active editor file** (with very
  long files trimmed in the middle).
- The current **selection**.
- A **cursor neighborhood** (a few thousand characters around the caret).

The plugin **excludes likely-secret files** from any auto-collected workspace
snippets:

- `.env*`
- `*.pem`, `*.key`, `*.pfx`, `*.p12`
- `secrets/**`, `.aws/**`
- `id_rsa*`
- Common build directories (`node_modules`, `dist`, `build`, `.git`)

If you don't want any of this, untoggle **Include IDE context** in the
composer's `+` menu before sending.

## Workspace skills & checks

Files under `.codesetu/skills/*.md` and `.codesetu/checks/*.md` in your
workspace are folded into the system prompt for each chat message. This is the
only place workspace content is read for prompts (besides the active editor
context above). Keep secrets out of these files.

## Air-gapped use

Point **Base URL** at your internal gateway (TGI / vLLM / Ollama / a private
OpenAI-compatible proxy). The plugin will only talk to that URL. Hosted-model
defaults are _defaults_, not requirements — you can replace them.

## Open source

Apache 2.0. Source at
[github.com/getcodesetu/codesetu](https://github.com/getcodesetu/codesetu).
Audit, fork, or self-host. Security disclosures: see `SECURITY.md` in the
repository.
