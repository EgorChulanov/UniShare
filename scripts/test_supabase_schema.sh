#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
PG_BIN=${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}
DATA_DIR=$(mktemp -d "${TMPDIR:-/tmp}/unishare-postgres.XXXXXX")
PORT=${UNISHARE_TEST_DB_PORT:-55439}

cleanup() {
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$DATA_DIR"
}
trap cleanup EXIT INT TERM

"$PG_BIN/initdb" -D "$DATA_DIR" -A trust --no-locale -E UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$DATA_DIR" -o "-p $PORT -F" -w start >/dev/null

PSQL="$PG_BIN/psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $PORT -d postgres"
$PSQL -f "$ROOT/supabase/tests/bootstrap.sql" >/dev/null
for migration in "$ROOT"/supabase/migrations/*.sql; do
    echo "Applying $(basename "$migration")"
    $PSQL -f "$migration" >/dev/null
done
$PSQL -f "$ROOT/supabase/seed.sql" >/dev/null
$PSQL -f "$ROOT/supabase/tests/security_smoke.sql"
