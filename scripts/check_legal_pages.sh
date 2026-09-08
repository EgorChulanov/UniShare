#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
EXPECTED=$(mktemp "${TMPDIR:-/tmp}/unishare-legal-pages.XXXXXX")
trap 'rm -f "$EXPECTED"' EXIT INT TERM
"$ROOT/scripts/generate_legal_pages.sh" "$EXPECTED"
cmp "$EXPECTED" "$ROOT/supabase/functions/legal/pages.ts" >/dev/null || {
    echo "Generated legal page module is stale; run scripts/generate_legal_pages.sh" >&2
    exit 1
}

echo "Legal pages are synchronized"
