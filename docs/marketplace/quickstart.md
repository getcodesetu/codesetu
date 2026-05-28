# Quickstart

CodeSetu is a multi-provider AI coding assistant for JetBrains IDEs. You bring
the model — local or hosted — and chat with it from a dedicated tool window,
with selected-code actions in the editor.

This page gets you from a fresh install to a working chat in **under two
minutes**, against the provider of your choice.

---

## 1. Install

- Open **Settings → Plugins → Marketplace**, search for **CodeSetu**, install,
  and restart the IDE.
- Or install the `.zip` from GitHub via **Settings → Plugins → ⚙ → Install
  Plugin from Disk…**.

## 2. Open the tool window

Open the **CodeSetu** tool window on the right dock. You'll see the chat
composer with a `provider · model` chip — that chip is your control surface.

## 3. Configure a provider

Click the **`provider · model` chip** in the composer and choose **⚙ Configure
provider / endpoint…**. Pick one of:

### Sarvam (Indic-aware hosted)

- Base URL: `https://api.sarvam.ai/v1`
- Model: `sarvam-30b` (or another Sarvam model)
- API key: your Sarvam API key

### Hugging Face (any served chat model)

- Base URL: `https://router.huggingface.co/v1` (or your dedicated endpoint URL)
- Model: any served Hugging Face repo id, e.g. `meta-llama/Llama-3.3-70B-Instruct`,
  `Qwen/Qwen2.5-72B-Instruct`, `deepseek-ai/DeepSeek-V3-0324`
- API key: your Hugging Face token (`hf_…`)

### OpenAI-compatible — Ollama / vLLM / local

- Base URL: `http://localhost:11434/v1` (Ollama default; change to your server)
- Model: e.g. `qwen2.5-coder:7b`, `llama3.1:8b`, or whatever you've pulled
- API key: `ollama` for a local Ollama server, otherwise the API key for your
  endpoint

Your key is stored in the OS **PasswordSafe** (keychain) — never in plaintext
settings.

## 4. Chat

Type a message in the composer and click the send button (the up arrow), or
click the **`+`** menu to toggle whether to include your active editor as IDE
context.

The assistant streams its reply with rendered markdown — fenced code blocks,
bold, inline code, and bullet lists all render.

## 5. Selected-code actions

In any editor, select some code → right-click → pick one of:

- **Explain with CodeSetu**
- **Refactor with CodeSetu**
- **Write Tests with CodeSetu**
- **Fix Bug with CodeSetu**
- **Add Docs with CodeSetu**

The chat tool window opens with the answer.

## 6. Switch models on the fly

Click the chip again any time:

- Pick a **curated model** from the list,
- type a **custom model id** (any Hub repo id, any endpoint model),
- or re-run **Configure provider / endpoint…** to move between providers.

The next message uses the new model. No restart, no settings detour.

---

## Tips

- **Workspace skills & checks** — drop `.codesetu/skills/*.md` and
  `.codesetu/checks/*.md` files at the root of your project; their bodies are
  folded into the system prompt.
- **Air-gapped?** Point the base URL at your own endpoint (TGI, vLLM, Ollama,
  internal gateway). Nothing leaves your network.
- **Privacy:** prompts go only to the provider you configured. CodeSetu has no
  telemetry.
