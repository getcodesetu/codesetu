# CodeSetu Release Notes

Human-friendly highlights of what's new, grouped by theme. For the complete,
technical list of every change, see the [CHANGELOG](../CHANGELOG.md) — that
remains the source of truth.

Everything here is **bring-your-own-model** and works fully local / air-gapped:
point CodeSetu at Sarvam, Ollama, vLLM, OpenRouter, or any OpenAI-compatible
endpoint.

---

## 0.4.14 — Codebase-aware, more transparent, runs anywhere

Shipped for **both** VS Code and JetBrains (IntelliJ / PyCharm / WebStorm), now
aligned at the same version.

### 🧠 `@workspace` — semantic codebase search

Index your repo once and CodeSetu retrieves code by *meaning*, not just text.

- Type `@workspace <question>` in chat, or let Agent Mode call the
  `search_workspace` tool.
- **Auto-builds on first use** and **auto re-indexes a few seconds after you
  save** (incremental) — retrieval stays fresh with no manual step.
- **Always-on retrieval** option: pull relevant code into *every* turn, not only
  when you type `@workspace`.
- Runs against any OpenAI-compatible embeddings endpoint (defaults to Ollama
  `nomic-embed-text`). The index persists under `.codesetu/`.

### 🤖 Agent Mode — now the default

- Reads, edits, and runs commands in a tool-calling loop, with your approval and
  a one-click **revert** of a turn's edits.
- **Works with models that lack native tool-calling** (e.g. Gemma and many small
  local models) via a prompted tool-calling fallback.
- Read-only tools auto-run; file edits and shell commands ask first.

### 🔍 "Context & activity" panel — see what CodeSetu is doing

Every turn shows the **provider · model · endpoint**, whether Agent Mode is on,
the **tools available**, and the **@workspace** outcome (retrieved files, or the
reason it found nothing). A small **version badge** by the model picker makes it
obvious which build is loaded.

### ✂️ Sharper editing & context

- **`/edit`** — rewrite a selection or file from an instruction, preview it as a
  diff, and **accept/reject individual hunks**. Available as a command and as a
  `/edit` slash in chat.
- **`@folder`** pinning — pin a whole folder as context, not just single files.
- **Multi-session chat history** — a switcher to jump between past
  conversations; "New chat" starts a fresh one and keeps the old.

### 🐳 On-prem Docker installer

A turnkey self-hosted stack (`deploy/docker/`): one OpenAI-compatible server that
serves **both** the chat/agent model and the `@workspace` embedding model, fully
inside your network. Includes an **air-gapped** install path (save image + model
volume, restore offline), a health check, a GPU toggle, and a documented vLLM
alternative. The IDE extensions are unchanged — they just point at the endpoint.

### 💡 Tips

- For agent / coding tasks, prefer a tool-calling coder model such as
  `qwen2.5-coder`. Reasoning-only models (which emit a long "thinking" stream
  before the answer) can return an empty reply inside the tool loop.
- To use a large context window with local Ollama, raise it on the server, e.g.
  `OLLAMA_CONTEXT_LENGTH=131072 ollama serve` — the model's context window is a
  server setting, separate from the per-reply output limit.

---

<!-- Add new releases above this line -->
