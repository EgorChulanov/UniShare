#!/bin/sh
set -eu

run_bounded() {
    seconds=$1
    shift
    "$@" &
    command_pid=$!
    elapsed=0
    while kill -0 "$command_pid" 2>/dev/null && [ "$elapsed" -lt "$seconds" ]; do
        sleep 1
        elapsed=$((elapsed + 1))
    done
    if kill -0 "$command_pid" 2>/dev/null; then
        kill -TERM "$command_pid" 2>/dev/null || true
        return 124
    fi
    wait "$command_pid"
}

local_status_env() {
    status_file=$(mktemp "${TMPDIR:-/tmp}/unishare-ui-status.XXXXXX")
    supabase status -o env >"$status_file" 2>/dev/null &
    status_pid=$!
    attempt=0
    while kill -0 "$status_pid" 2>/dev/null; do
        if grep -q '^API_URL=' "$status_file" && grep -q '^ANON_KEY=' "$status_file"; then
            pkill -TERM -P "$status_pid" 2>/dev/null || true
            kill -TERM "$status_pid" 2>/dev/null || true
            wait "$status_pid" 2>/dev/null || true
            cat "$status_file"
            rm -f "$status_file"
            return 0
        fi
        attempt=$((attempt + 1))
        if [ "$attempt" -ge 20 ]; then
            pkill -TERM -P "$status_pid" 2>/dev/null || true
            kill -TERM "$status_pid" 2>/dev/null || true
            wait "$status_pid" 2>/dev/null || true
            rm -f "$status_file"
            echo "Timed out while reading local Supabase status" >&2
            return 1
        fi
        sleep 1
    done

    wait "$status_pid"
    cat "$status_file"
    rm -f "$status_file"
}

reset_local_database() {
    reset_log=$(mktemp "${TMPDIR:-/tmp}/unishare-ui-reset.XXXXXX")
    supabase db reset --local --yes >"$reset_log" 2>&1 &
    reset_pid=$!
    attempt=0
    while kill -0 "$reset_pid" 2>/dev/null; do
        if grep -q 'Finished supabase db reset' "$reset_log"; then
            pkill -TERM -P "$reset_pid" 2>/dev/null || true
            kill -TERM "$reset_pid" 2>/dev/null || true
            wait "$reset_pid" 2>/dev/null || true
            cat "$reset_log"
            rm -f "$reset_log"
            return 0
        fi
        attempt=$((attempt + 1))
        if [ "$attempt" -ge 180 ]; then
            pkill -TERM -P "$reset_pid" 2>/dev/null || true
            kill -TERM "$reset_pid" 2>/dev/null || true
            wait "$reset_pid" 2>/dev/null || true
            cat "$reset_log" >&2
            rm -f "$reset_log"
            echo "Timed out while resetting local Supabase" >&2
            return 1
        fi
        sleep 1
    done

    wait "$reset_pid"
    cat "$reset_log"
    rm -f "$reset_log"
}

reset_local_database
./scripts/start_local_supabase.sh >/dev/null
STATUS=$(local_status_env)
UNISHARE_E2E_URL=$(printf '%s\n' "$STATUS" | sed -n 's/^API_URL="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
UNISHARE_E2E_KEY=$(printf '%s\n' "$STATUS" | sed -n 's/^ANON_KEY="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
export UNISHARE_E2E_URL UNISHARE_E2E_KEY
export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode-beta.app/Contents/Developer}

DEVICE_ID=$(xcrun simctl list devices available -j | jq -r '
    [.devices[][] | select(.name == "UniShare QA iPhone")][0].udid //
    [.devices[][] | select(.name | startswith("iPhone"))][0].udid
')
[ -n "$DEVICE_ID" ] && [ "$DEVICE_ID" != null ] || { echo "No iPhone simulator found" >&2; exit 1; }

run_bounded 15 xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
run_bounded 60 xcrun simctl bootstatus "$DEVICE_ID" -b || {
    echo "CoreSimulator did not boot within 60 seconds. Restart macOS before running UI E2E." >&2
    exit 1
}

run_bounded 900 xcodebuild test \
    -project UniShare.xcodeproj \
    -scheme UniShare \
    -destination "platform=iOS Simulator,id=$DEVICE_ID" \
    -derivedDataPath "$PWD/DerivedData/LocalE2E" \
    -clonedSourcePackagesDirPath /tmp/UniShareResolvedPackages \
    -only-testing:UniShareUITests/LaunchUITests/testFullRegistrationProfileAndDeletionAgainstLocalSupabase \
    -only-testing:UniShareUITests/LaunchUITests/testMutualMatchAndChatAgainstLocalSupabase \
    "UNISHARE_E2E_URL=$UNISHARE_E2E_URL" \
    "UNISHARE_E2E_KEY=$UNISHARE_E2E_KEY" \
    CODE_SIGNING_ALLOWED=NO
