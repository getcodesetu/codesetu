# FAQ

## Do I need an account or subscription with CodeSetu?

No. CodeSetu is open-source (Apache 2.0) and free. You bring your own model
(hosted or local) and your own provider key.

## Which JetBrains IDEs are supported?

Anything on the IntelliJ Platform `since-build` 252 or later (IDEA 2025.2+,
and the matching versions of PyCharm, WebStorm, GoLand, Rider, Android Studio,
etc.). The chat tool window uses JCEF, which is bundled with these IDEs.

## Where is my API key stored?

In the OS **PasswordSafe** (Keychain on macOS, Credential Manager on Windows,
KWallet / Secret Service on Linux). Never in the plugin's settings XML in
plaintext. Env vars (`SARVAM_API_KEY`, `HF_TOKEN`, `CODESETU_API_KEY`) are also
supported.

## Does the plugin send any data anywhere besides my provider?

No. There is no telemetry, no analytics, no third-party endpoints. Every
network call goes to the **Base URL** you configured.

## Can I use it offline / air-gapped?

Yes — point **Base URL** at your internal endpoint (TGI, vLLM, Ollama, a
private OpenAI-compatible gateway). Hosted-model defaults are only defaults.

## Which Hugging Face models work?

Any chat-capable model **currently served** by an inference provider on the
Hugging Face router (Llama, Qwen, DeepSeek, Mistral, Gemma, …) — bring your
`hf_…` token. For a model not on the router, deploy it to a dedicated Inference
Endpoint (or TGI / vLLM) and point CodeSetu's base URL at it. Embedding, image,
audio, and raw base models won't work as chat — that's a property of the model.

## Which Ollama / vLLM model should I use?

Anything you've pulled / served. A practical first pick for coding:
`qwen2.5-coder:7b` on Ollama or a 32B+ Qwen-Coder model on vLLM. Larger is
better for refactors and explanations; smaller is faster for inline use.

## How do I switch models or providers without restarting?

Click the **`provider · model` chip** in the composer. The menu has:

- **⚙ Configure provider / endpoint…** — switch provider and set base
  URL / model / token.
- **Enter a custom model id…** — type any model id for the current provider.
- A list of **curated models** for the current provider.

The next message uses the new model.

## Does it work with multi-turn conversations?

Yes — the chat keeps a rolling per-session history. Older turns are dropped
once the transcript grows past a character budget, so long sessions don't
overflow your context window.

## Why does it ask me to "Include IDE context"?

For coding questions, the assistant is much more useful with your active file +
selection. The toggle lets you opt out per message — useful for general
questions where you don't want any file content sent to the provider.

## Where do I report bugs / ask for features?

[GitHub Issues](https://github.com/getcodesetu/codesetu/issues) for bugs and
feature requests. [Discord](https://discord.gg/sjVKU8cpC6) for chat. Security
disclosures: `SECURITY.md` in the repository.
