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
- `@folder` pinning (only `@file` shipped).
- Multi-session history list (single rolling transcript shipped; no session
  switcher yet).
- Per-hunk accept/reject in `/edit` (whole-edit apply shipped).

---

## Later — multi-week tracks

### Codebase indexing — `@workspace` semantic retrieval

The biggest _capability_ gap and the real moat for an on-prem / Indic-focused
assistant. Today Agent Mode navigates by grep/glob, which burns iterations and
misses semantically-related code. Embeddings + a local vector store would make
both chat and the agent dramatically smarter on large repos.

Scope (2–3 weeks): chunking, embeddings, a local vector store, incremental
re-index on file change, and retrieval wired into both chat context and the
agent loop. Air-gapped-friendly embedding options to match the
bring-your-own-model philosophy.

### On-prem Docker installer

Marked "Planned." A turnkey self-hosted deployment for enterprises that want
CodeSetu + an OpenAI-compatible inference server fully inside their network.

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
