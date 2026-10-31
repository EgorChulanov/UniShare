#!/usr/bin/env bash
# Runs the server test suite. Uses $DATABASE_URL when set; otherwise starts a
# throwaway PostgreSQL (needs initdb/pg_ctl on PATH or Docker).
set -euo pipefail
cd "$(dirname "$0")/.."

cleanup() { :; }
if [ -z "${DATABASE_URL:-}" ]; then
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    name="unishare-test-pg-$$"
    docker run -d --rm --name "$name" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=unishare -p 55499:5432 postgres:17-alpine >/dev/null
    cleanup() { docker stop "$name" >/dev/null; }
    trap cleanup EXIT
    for _ in $(seq 1 30); do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    sleep 1
    export DATABASE_URL="postgres://postgres:test@localhost:55499/unishare"
  else
    echo "Set DATABASE_URL to a disposable PostgreSQL database (all data in it is dropped)." >&2
    exit 1
  fi
fi

npm run test --workspace server
