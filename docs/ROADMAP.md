# CodeSetu Roadmap

A living, prioritized view of what's next. Ordered by developer impact relative
to what already ships in v0.4.0 (Agent Mode, Plan Mode, Skills, Voice).

This is intentionally lightweight — it records intent and sequencing, not
commitments. The [CHANGELOG](../CHANGELOG.md) remains the source of truth for
what has actually shipped.

Last reviewed: 2026-06-16

---

## Now — current sprint (week of 2026-06-16)

### Inline autocomplete (ghost-text Tab completions)

The highest-frequency interaction in any coding assistant, and the most
conspicuous gap relative to Copilot / Cursor / Continue. Marked "Planned" since
v0.1 and not yet landed.

Why now: hundreds of triggers per developer per day vs. a handful of
chat/agent calls; the FIM transport is already scoped (OpenAI `/v1/completions`
with `prompt` + `suffix`, Sarvam-30B is FIM-capable); no embeddings or indexing
infra required, so it fits a one-week box.

MVP scope:

- VSCode `InlineCompletionItemProvider`: debounce (~150–300ms),
  cancel-on-keystroke, prompt from text-before-cursor + suffix-after-cursor,
  capped context window.
- Single- and multi-line ghost text, accept on Tab.
- Settings: enable/disable, model override, debounce, max tokens (reuse
  existing provider config in `@codesetu/core`).
- Shared FIM helper in `packages/core` so JetBrains parity
  (`CompletionContributor`) is a fast-follow.

Ship VSCode first; JetBrains as a fast-follow once the core helper is proven.

---

## Next — same-sprint cheap wins

These are small, high-friction-removal items that can slot alongside the
autocomplete work.

### Apply-to-file / insert-at-cursor in chat

When the model returns a code block in plain chat, there's no one-click "apply
to open file" or "insert at cursor." Reuses the existing diff-preview UI.
Effort: ~1–2 days.

### Explicit context pinning (`@file`, `@folder`)

Let users pin files/folders into chat context instead of relying on
active-editor heuristics. Ships value now and the mention UI is reusable for
`@workspace` later. Effort: small.

### `/edit` with inline diff apply

A lighter middle ground between one-shot chat and full Agent Mode: select code
→ describe change → per-hunk diff → accept/reject. Reuses the diff preview that
`edit_file` already has. Marked "Planned" in the CHANGELOG. Effort: a few days.

---

## Soon — next sprint

### Agent Mode checkpoints / one-click revert

Agent Mode can edit many files and run `bash`, but there's no safety net to
undo a whole run. Snapshot-before-run + a "Restore" button builds the trust
needed to let the agent loose. Deepens the flagship rather than closing a new
gap, so it ranks behind autocomplete.

### Conversation persistence / history

Restore chat sessions on reopen and expose a session list. Removes a quiet
trust/UX tax. Effort: medium.

### Token / cost / context-usage indicator

Show tokens sent, context-window fill, and truncation warnings — especially
valuable for the self-hosted / Sarvam audience watching their own inference
budget. Effort: small, high perceived polish.

---

## Later — multi-week tracks

### Codebase indexing — `@workspace` semantic retrieval

The biggest *capability* gap and the real moat for an on-prem / Indic-focused
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
