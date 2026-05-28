# Providers & Models

CodeSetu is **bring-your-own-model**. It speaks OpenAI's `/v1/chat/completions`
shape, so anything that exposes that endpoint works — hosted, self-hosted, or
on a network you control.

You configure the provider, base URL, model, and key from the chat tool window
(click the **`provider · model` chip** → **Configure provider / endpoint…**) or
under **Settings → CodeSetu**.

---

## Built-in providers

### Sarvam

Indic-aware hosted models from Sarvam AI.

| Field    | Value                                               |
| -------- | --------------------------------------------------- |
| Base URL | `https://api.sarvam.ai/v1`                          |
| Model    | `sarvam-30b` (default)                              |
| Auth     | Sarvam API key                                      |
| Env vars | `SARVAM_API_KEY`, `SARVAM_BASE_URL`, `SARVAM_MODEL` |

### Hugging Face

Any **served, chat-capable** model on the Hugging Face Hub — through the hosted
router, your own dedicated Inference Endpoint, or self-hosted TGI.

| Field               | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| Base URL (router)   | `https://router.huggingface.co/v1`                        |
| Base URL (endpoint) | `https://<your-endpoint>.endpoints.huggingface.cloud/v1`  |
| Model               | any Hub repo id, e.g. `meta-llama/Llama-3.3-70B-Instruct` |
| Auth                | Hugging Face token (`hf_…`)                               |
| Env vars            | `HF_TOKEN`, `HF_BASE_URL`, `HF_MODEL`                     |

**Curated picks** offered in the in-chat model menu:

- `meta-llama/Llama-3.3-70B-Instruct`
- `Qwen/Qwen2.5-72B-Instruct`
- `Qwen/Qwen2.5-Coder-32B-Instruct`
- `deepseek-ai/DeepSeek-V3-0324`
- `meta-llama/Llama-3.1-8B-Instruct`
- `google/gemma-2-27b-it`
- `mistralai/Mistral-Small-24B-Instruct-2501`

You can always type a **custom model id** for anything else (or for a model
deployed to your own endpoint).

### OpenAI-compatible (Ollama, vLLM, SGLang, OpenRouter, LM Studio, local)

Anything that exposes `/v1/chat/completions`.

| Field    | Value                                                                                   |
| -------- | --------------------------------------------------------------------------------------- |
| Base URL | e.g. `http://localhost:11434/v1` (Ollama), `https://openrouter.ai/api/v1`, your own URL |
| Model    | e.g. `qwen2.5-coder:7b`, `llama3.1:8b`, an OpenRouter id, …                             |
| Auth     | the endpoint's API key (`ollama` for local Ollama)                                      |
| Env vars | `CODESETU_API_KEY`, `CODESETU_BASE_URL`, `CODESETU_MODEL`                               |

---

## What "any model" means — the honest boundary

- **Chat with any served chat-capable LLM.** Llama, Qwen, DeepSeek, Mistral,
  Gemma, etc. — anything an inference provider currently exposes on the
  Hugging Face router, or that you deploy yourself.
- **Not every model on the Hub.** Models nobody is currently serving aren't
  reachable via the router; you'd need to deploy them yourself (dedicated
  endpoint or TGI/vLLM).
- **Only chat-capable models.** Embedding models, image / audio / diffusion
  models, and raw base models without a chat template won't work in chat —
  that's a property of the model itself.

For anything not on the router, run TGI / vLLM / Ollama and point CodeSetu's
base URL at it.

---

## Air-gapped & enterprise

CodeSetu makes **no calls outside the provider you configured**. Point the base
URL at your internal gateway / TGI / vLLM cluster and it will work entirely on
your network. There is no CodeSetu telemetry.
