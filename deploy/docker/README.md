# CodeSetu on-prem installer (Docker)

A turnkey, self-hosted CodeSetu backend: an OpenAI-compatible inference server
that serves **both** the chat/agent model and the `@workspace` embedding model,
running entirely inside your network. Nothing leaves your perimeter — no
telemetry, no CodeSetu-hosted calls.

The CodeSetu IDE extensions are unchanged. They are clients; this stack is the
endpoint they point at. CodeSetu is config-driven (see `docs/ARCHITECTURE.md`),
so "self-hosting" means running an inference server and pointing the clients at
it — that is exactly what this bundle does.

```
 Developer machine                         On-prem server (this stack)
┌──────────────────────────┐             ┌──────────────────────────────┐
│ VS Code / JetBrains       │  HTTP /v1   │  Ollama (OpenAI-compatible)   │
│  + CodeSetu extension     │ ──────────▶ │   • chat / agent model        │
│  baseUrl = server:11434   │             │   • embedding model           │
└──────────────────────────┘             └──────────────────────────────┘
```

## Prerequisites

- Docker + Docker Compose v2 (`docker compose`).
- Disk for model weights (a 7B model is ~4–5 GB; embeddings ~0.3 GB).
- GPU optional — CPU works, GPU is much faster (see "GPU" below).

## Quick start (connected network)

```bash
cd deploy/docker
cp .env.example .env            # optionally edit CHAT_MODEL / EMBEDDING_MODEL
docker compose up -d            # first run downloads the models
docker compose logs -f model-init   # watch the model pull finish
./healthcheck.sh                # confirm chat + embeddings respond
./print-settings.sh             # prints the exact IDE settings to paste
```

Then in the IDE set the provider to **OpenAI-compatible** with the printed
`baseUrl` and `model` (API key can be any non-empty string, e.g. `local`).
Build the semantic index once with **CodeSetu: Index Workspace**.

## Configuration (`.env`)

| Variable          | Default            | Purpose                                                         |
| ----------------- | ------------------ | --------------------------------------------------------------- |
| `CODESETU_PORT`   | `11434`            | Host port for the OpenAI-compatible API.                        |
| `CHAT_MODEL`      | `qwen2.5-coder:7b` | Chat/agent model. **Must support tool calling** for Agent Mode. |
| `EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model for `@workspace` indexing.                      |

Bigger chat models (`qwen2.5-coder:14b`, `:32b`) are smarter but need more
RAM/VRAM. `llama3.1:8b` is a solid general alternative.

## Air-gapped install

Do the download once on a connected machine, then move the artifacts across:

```bash
# On a machine WITH internet:
cd deploy/docker && cp .env.example .env
docker compose up -d && docker compose logs -f model-init   # pull models

# 1) Save the container image
docker save ollama/ollama:latest -o codesetu-ollama-image.tar

# 2) Back up the model volume (weights live here)
docker run --rm -v codesetu-ollama-models:/data -v "$PWD":/backup alpine \
  tar czf /backup/codesetu-models.tar.gz -C /data .
```

Transfer `codesetu-ollama-image.tar`, `codesetu-models.tar.gz`, and this
`deploy/docker/` folder to the air-gapped host, then:

```bash
# On the AIR-GAPPED host:
docker load -i codesetu-ollama-image.tar
docker volume create codesetu-ollama-models
docker run --rm -v codesetu-ollama-models:/data -v "$PWD":/backup alpine \
  tar xzf /backup/codesetu-models.tar.gz -C /data

# Start only the server (skip model-init — models are already restored)
docker compose up -d inference
./healthcheck.sh
./print-settings.sh
```

Because the weights are restored into the volume, `model-init` is unnecessary;
the server has no reason to reach the internet.

## GPU

Install the NVIDIA Container Toolkit on the host, then uncomment the `deploy:`
block under the `inference` service in `docker-compose.yml` and recreate:

```bash
docker compose up -d --force-recreate inference
```

## Serving developers on other machines

By default `print-settings.sh` emits `localhost`. When developers connect from
their own machines, pass the server's hostname/IP:

```bash
CODESETU_HOST=codesetu.internal.example.com ./print-settings.sh
```

Put a TLS-terminating reverse proxy (nginx/Caddy/Traefik) in front for HTTPS and
auth if you expose it beyond a trusted subnet.

## Alternative engine: vLLM / TGI / SGLang

This bundle uses Ollama because it serves chat **and** embeddings from one
OpenAI-compatible process with the simplest air-gap story. If you standardize on
**vLLM** (often higher throughput on GPUs), run two OpenAI-compatible services
instead and point CodeSetu at them:

```yaml
services:
  chat:
    image: vllm/vllm-openai:latest
    command: ["--model", "Qwen/Qwen2.5-Coder-7B-Instruct", "--port", "8000"]
    ports: ["8000:8000"]
  embeddings:
    image: vllm/vllm-openai:latest
    command: ["--model", "intfloat/e5-mistral-7b-instruct", "--port", "8001"]
    ports: ["8001:8001"]
```

Then set `codesetu.baseUrl=http://server:8000/v1` and
`codesetu.workspaceIndex.embeddingBaseUrl=http://server:8001/v1`. The chat and
embedding base URLs are independent in CodeSetu precisely so they can be
different servers.

## Notes & caveats

- **Inline FIM completions**: CodeSetu's autocomplete uses `/v1/completions` with
  a `suffix`. Coverage varies by engine/model; chat, Agent Mode, and
  `@workspace` retrieval do not depend on it.
- **Privacy**: this stack makes no outbound calls once models are present. See
  `docs/marketplace/privacy-and-security.md`.
- **Updating models**: edit `.env`, then
  `docker compose run --rm model-init` to pull the new ones.
