#!/usr/bin/env bash
#
# Copyright 2026 CodeSetu Contributors
# Licensed under the Apache License, Version 2.0.
#
# Verify the on-prem stack is up and both models answer. Run after `up -d`.

set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

PORT="${CODESETU_PORT:-11434}"
CHAT_MODEL="${CHAT_MODEL:-qwen2.5-coder:7b}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-nomic-embed-text}"
BASE="http://localhost:${PORT}/v1"

echo "Checking ${BASE} ..."

echo -n "  chat (${CHAT_MODEL}): "
if curl -fsS "${BASE}/chat/completions" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${CHAT_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":1}" \
  >/dev/null; then
  echo "OK"
else
  echo "FAILED"; exit 1
fi

echo -n "  embeddings (${EMBEDDING_MODEL}): "
if curl -fsS "${BASE}/embeddings" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"${EMBEDDING_MODEL}\",\"input\":[\"ping\"]}" \
  >/dev/null; then
  echo "OK"
else
  echo "FAILED"; exit 1
fi

echo "All checks passed. Run ./print-settings.sh for the IDE config."
