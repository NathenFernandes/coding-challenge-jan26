#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FUNCTIONS_PID=""
FRONTEND_PID=""
TRIGGER_PID=""

cleanup() {
  local exit_code=$?

  for pid in "$FUNCTIONS_PID" "$FRONTEND_PID" "$TRIGGER_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done

  pnpm dlx supabase@latest stop >/dev/null 2>&1 || true
  docker rm -f cleara-surrealdb >/dev/null 2>&1 || true

  exit "$exit_code"
}

trap cleanup INT TERM EXIT

docker rm -f cleara-surrealdb >/dev/null 2>&1 || true
mkdir -p .surreal-data
docker run -d \
  --name cleara-surrealdb \
  -p 8000:8000 \
  -v "$ROOT_DIR/.surreal-data:/data" \
  surrealdb/surrealdb:v2.3.10 \
  start --log info --user root --pass root rocksdb:/data/cleara.db >/dev/null

pnpm dlx supabase@latest start

pnpm dlx supabase@latest functions serve --no-verify-jwt &
FUNCTIONS_PID=$!

(
  cd "$ROOT_DIR/frontend"
  pnpm dev
) &
FRONTEND_PID=$!

(
  cd "$ROOT_DIR/frontend"
  set -a
  source .env.local
  set +a
  pnpm trigger:dev
) &
TRIGGER_PID=$!

while true; do
  for pid in "$FUNCTIONS_PID" "$FRONTEND_PID" "$TRIGGER_PID"; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      wait "$pid"
      exit $?
    fi
  done

  sleep 1
done
