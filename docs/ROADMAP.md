# CodeSetu Roadmap

A living, prioritized view of what's next. Ordered by developer impact relative
to what already ships in v0.4.0 (Agent Mode, Plan Mode, Skills, Voice).

This is intentionally lightweight — it records intent and sequencing, not
commitments. The [CHANGELOG](../CHANGELOG.md) remains the source of truth for
what has actually shipped.

Last reviewed: 2026-06-17

---

## Shipped (week of 2026-06-16, VSCode)

The Now / Next / Soon tracks below all landed on
`feature/roadmap-now-next-soon`, one commit each, with unit tests and a green
build/lint/test. JetBrains parity is the open follow-up for each.

- **Inline completion polish** — debounce
  (`codesetu.inlineCompletions.debounceMs`), cancel-on-supersede, one-entry
  cache. (The core `InlineCompletionItemProvider` + FIM transport already
  existed; this hardened it.)
- **Code-block Copy / Insert** — buttons on every assistant code block; Insert
  targets the last-active editor.
- **@-mention file pinning** — pin workspace files as primary context; chips
  persist across turns/reloads; rendered as a dedicated context section in
  `@codesetu/core`.
- **Edit with CodeSetu** (`codesetu.editSelection`) — instruction → native
  diff preview → apply on accept.
- **Agent Mode checkpoints** (`codesetu.revertLastAgentEdits`) — per-turn file
  snapshots with one-click revert (structured edits only; `bash` side effects
  out of scope).
- **Conversation persistence** — transcript saved per workspace and restored
  on reload; **New chat** action.
- **Context-usage gauge** — "~N ctx" chip estimating tokens per turn.

### Open follow-ups from this batch

- JetBrains parity for all seven (shared logic already lives in
  `@codesetu/core` where applicable).
- ~~`@folder` pinning (only `@file` shipped).~~ **Done** — pinning a folder
  expands to the files under it (capped, excludes honoured) on both platforms.
- Multi-session history list (single rolling transcript shipped; no session
  switcher yet).
- ~~Per-hunk accept/reject in `/edit` (whole-edit apply shipped).~~ **Done** —
  `computeHunks` / `applyHunks` in `@codesetu/core` (Kotlin mirror in JetBrains)
  back a "Choose Hunks…" picker on both platforms.

---

## Later — multi-week tracks

### Codebase indexing — `@workspace` semantic retrieval

**Shipped for VSCode and JetBrains.** Chunking, embeddings against any
OpenAI-compatible `/v1/embeddings` endpoint, a local persisted vector store under
`.codesetu/`, incremental re-index by file hash, and retrieval wired into **both**
chat context (`@workspace …`) and the agent loop (a `search_workspace` tool).
Air-gapped-friendly: point embeddings at a local server. **CodeSetu: Index
Workspace** builds/refreshes it. The engine lives in `@codesetu/core`; JetBrains
has a native Kotlin mirror (`ai.codesetu.retrieval`).

Open follow-ups:

- **Auto re-index on save** — today indexing is a manual command; a debounced
  file-watcher would keep it fresh.
- **Always-on retrieval option** — a setting to retrieve every turn, not only
  when `@workspace` is typed.

### On-prem Docker installer

**Shipped** — `deploy/docker/`. A turnkey self-hosted stack: an
OpenAI-compatible server (Ollama) that serves both the chat/agent model and the
`@workspace` embedding model, fully inside your network. Includes an air-gapped
install path (save image + model volume, restore offline), a `print-settings.sh`
that emits the exact IDE config, a `healthcheck.sh`, a GPU toggle, and a
documented vLLM/TGI alternative. The IDE extensions are unchanged — they just
point at the endpoint.

Open follow-ups:

- Optional bundled reverse proxy (TLS + auth) for exposure beyond a trusted
  subnet.
- A prebuilt offline bundle artifact (image + weights tarball) published per
  release so customers skip the connected-machine step entirely.

---

## Principles

- **Ambient before deliberate** — features developers touch every keystroke
  (autocomplete) before features they invoke occasionally.
- **Reuse the substrate** — provider abstraction, diff preview, and tool
  registry already exist in `@codesetu/core`; new features should lean on them.
- **VSCode first, JetBrains fast-follow** — land shared logic in `packages/core`
  so platform parity is mechanical, not a rewrite.
- **No vendor lock-in** — anything that calls a model must work against any
  OpenAI-compatible endpoint (Sarvam, HF, Ollama, vLLM, on-prem).
