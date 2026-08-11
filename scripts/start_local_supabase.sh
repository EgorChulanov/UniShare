#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SECRET_FILE="$ROOT/Config/Secrets.xcconfig"
PROJECT_ID=$(awk -F= '/^[[:space:]]*project_id[[:space:]]*=/{gsub(/[ "\047]/, "", $2); print $2; exit}' "$ROOT/supabase/config.toml")
PROJECT_ID=${PROJECT_ID:-unishare}

services_ready() {
    docker inspect -f '{{.State.Health.Status}}' "supabase_db_$PROJECT_ID" 2>/dev/null | grep -q '^healthy$' &&
    docker inspect -f '{{.State.Health.Status}}' "supabase_auth_$PROJECT_ID" 2>/dev/null | grep -q '^healthy$' &&
    docker inspect -f '{{.State.Status}}' "supabase_edge_runtime_$PROJECT_ID" 2>/dev/null | grep -q '^running$'
}

if services_ready; then
    echo "Supabase local development setup is already healthy."
    exit 0
fi

if [ -f "$SECRET_FILE" ]; then
    RAWG_API_KEY=$(awk -F= '/^[[:space:]]*RAWG_API_KEY[[:space:]]*=/{sub(/^[^=]*=[[:space:]]*/, ""); sub(/[[:space:]]*$/, ""); print; exit}' "$SECRET_FILE")
    export RAWG_API_KEY
fi

supabase start \
    -x imgproxy,realtime,studio,vector,logflare,mailpit,postgres-meta,supavisor \
    --yes &
START_PID=$!

cleanup_start() {
    pkill -TERM -P "$START_PID" 2>/dev/null || true
    kill -TERM "$START_PID" 2>/dev/null || true
    wait "$START_PID" 2>/dev/null || true
}
trap cleanup_start HUP INT TERM

attempt=0
while kill -0 "$START_PID" 2>/dev/null; do
    if services_ready; then
        cleanup_start
        trap - HUP INT TERM
        echo "Supabase local development setup is healthy."
        exit 0
    fi
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 120 ]; then
        cleanup_start
        echo "Supabase did not become healthy within 120 seconds." >&2
        exit 1
    fi
    sleep 1
done

wait "$START_PID"
