#!/usr/bin/env bash
#
# Copyright 2026 CodeSetu Contributors
# Licensed under the Apache License, Version 2.0.
#
# Print the exact CodeSetu IDE settings (and env vars) to point the extensions at
# this on-prem stack. Reads ./.env if present, otherwise uses the defaults.

set -euo pipefail
cd "$(dirname "$0")"

# Load .env if present (without exporting comments/blank lines).
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

PORT="${CODESETU_PORT:-11434}"
CHAT_MODEL="${CHAT_MODEL:-qwen2.5-coder:7b}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-nomic-embed-text}"

# Host that developer machines reach the server on. Override with the server's
# hostname/IP when developers connect from other machines:
#   CODESETU_HOST=codesetu.internal.example.com ./print-settings.sh
HOST="${CODESETU_HOST:-localhost}"
BASE_URL="http://${HOST}:${PORT}/v1"

cat <<EOF

CodeSetu on-prem endpoint: ${BASE_URL}

────────────────────────────────────────────────────────────────────────
VS Code  →  settings.json
────────────────────────────────────────────────────────────────────────
{
  "codesetu.provider": "openai-compatible",
  "codesetu.baseUrl": "${BASE_URL}",
  "codesetu.model": "${CHAT_MODEL}",
  "codesetu.workspaceIndex.embeddingBaseUrl": "${BASE_URL}",
  "codesetu.workspaceIndex.embeddingModel": "${EMBEDDING_MODEL}"
}
(API key: any non-empty string for a keyless local server — e.g. "local".
 Set it via "CodeSetu: Setup Provider".)

────────────────────────────────────────────────────────────────────────
JetBrains  →  Settings ▸ Tools ▸ CodeSetu
────────────────────────────────────────────────────────────────────────
  Provider:  OpenAI-compatible
  Base URL:  ${BASE_URL}
  Model:     ${CHAT_MODEL}
  API key:   local

────────────────────────────────────────────────────────────────────────
Environment variables (CI / headless / shared shell)
────────────────────────────────────────────────────────────────────────
export CODESETU_PROVIDER=openai-compatible
export CODESETU_BASE_URL=${BASE_URL}
export CODESETU_MODEL=${CHAT_MODEL}
export CODESETU_API_KEY=local
export CODESETU_EMBEDDING_BASE_URL=${BASE_URL}
export CODESETU_EMBEDDING_MODEL=${EMBEDDING_MODEL}

EOF
