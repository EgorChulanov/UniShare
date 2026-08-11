#!/bin/sh
set -eu

need() { command -v "$1" >/dev/null || { echo "Missing command: $1" >&2; exit 1; }; }
need curl
need jq
need supabase

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

local_status_env() {
    status_file=$(mktemp "${TMPDIR:-/tmp}/unishare-status.XXXXXX")
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

if [ -n "${E2E_API_URL:-}" ]; then
    API_URL=${E2E_API_URL%/}
    ANON_KEY=${E2E_PUBLISHABLE_KEY:?E2E_PUBLISHABLE_KEY is required for hosted E2E}
    echo "E2E target: hosted Supabase"
else
    "$ROOT/scripts/start_local_supabase.sh" >/dev/null
    supabase migration up --local >/dev/null
    STATUS=$(local_status_env)
    API_URL=$(printf '%s\n' "$STATUS" | sed -n 's/^API_URL="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
    ANON_KEY=$(printf '%s\n' "$STATUS" | sed -n 's/^ANON_KEY="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
    [ -n "$API_URL" ] && [ -n "$ANON_KEY" ] || { echo "Local Supabase is not running" >&2; exit 1; }

    if ! curl -fsS --max-time 5 "$API_URL/functions/v1/_internal/health" >/dev/null 2>&1; then
        supabase stop --yes >/dev/null
        "$ROOT/scripts/start_local_supabase.sh" >/dev/null
        STATUS=$(local_status_env)
        API_URL=$(printf '%s\n' "$STATUS" | sed -n 's/^API_URL="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
        ANON_KEY=$(printf '%s\n' "$STATUS" | sed -n 's/^ANON_KEY="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
    fi
fi

RUN_ID=${E2E_RUN_ID:-"$(date +%s)$$"}
PASSWORD=${E2E_PASSWORD:-"UniShare-E2E-${RUN_ID}!"}
EMAIL_DOMAIN=${E2E_EMAIL_DOMAIN:-unishare.test}
TMP=$(mktemp -d "${TMPDIR:-/tmp}/unishare-e2e.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM

signup() {
    email=$1
    response_file="$TMP/signup.$$.json"
    status=$(curl -sS -o "$response_file" -w '%{http_code}' "$API_URL/auth/v1/signup" \
        -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
        -d "$(jq -n --arg email "$email" --arg password "$PASSWORD" '{email:$email,password:$password}')")
    response=$(cat "$response_file")
    if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
        echo "Signup failed for $email (HTTP $status): $response" >&2
        return 1
    fi
    token=$(printf '%s' "$response" | jq -er '.access_token')
    uid=$(printf '%s' "$response" | jq -er '.user.id')
    printf '%s|%s\n' "$uid" "$token"
}

login() {
    email=$1
    response_file="$TMP/login.$$.json"
    status=$(curl -sS -o "$response_file" -w '%{http_code}' \
        "$API_URL/auth/v1/token?grant_type=password" \
        -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
        -d "$(jq -n --arg email "$email" --arg password "$PASSWORD" '{email:$email,password:$password}')")
    response=$(cat "$response_file")
    if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
        echo "Login failed for $email (HTTP $status): $response" >&2
        return 1
    fi
    token=$(printf '%s' "$response" | jq -er '.access_token')
    uid=$(printf '%s' "$response" | jq -er '.user.id')
    printf '%s|%s\n' "$uid" "$token"
}

request() {
    method=$1 token=$2 path=$3 body=${4:-}
    if [ -n "$body" ]; then
        curl -fsS -X "$method" "$API_URL$path" -H "apikey: $ANON_KEY" \
            -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
            -H 'Prefer: return=representation' -d "$body"
    else
        curl -fsS -X "$method" "$API_URL$path" -H "apikey: $ANON_KEY" \
            -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
            -H 'Prefer: return=representation'
    fi
}

assert() {
    printf '%s' "$1" | jq -e "$2" >/dev/null || {
        echo "Assertion failed: $2" >&2
        printf '%s\n' "$1" | jq . >&2
        exit 1
    }
}

if [ "${E2E_USE_EXISTING_USERS:-0}" = 1 ]; then
    SIGNED_A=$(login "alice.${RUN_ID}@${EMAIL_DOMAIN}")
    SIGNED_B=$(login "bob.${RUN_ID}@${EMAIL_DOMAIN}")
    SIGNED_C=$(login "carol.${RUN_ID}@${EMAIL_DOMAIN}")
else
    SIGNED_A=$(signup "alice.${RUN_ID}@${EMAIL_DOMAIN}")
    SIGNED_B=$(signup "bob.${RUN_ID}@${EMAIL_DOMAIN}")
    SIGNED_C=$(signup "carol.${RUN_ID}@${EMAIL_DOMAIN}")
fi
IFS='|' read -r UID_A TOKEN_A <<EOF
$SIGNED_A
EOF
IFS='|' read -r UID_B TOKEN_B <<EOF
$SIGNED_B
EOF
IFS='|' read -r UID_C TOKEN_C <<EOF
$SIGNED_C
EOF
echo "E2E stage: users registered"

profile() {
    uid=$1 username=$2 platforms=$3 games=$4 skills=$5
    jq -n --arg uid "$uid" --arg username "$username" \
        --argjson platforms "$platforms" --argjson games "$games" --argjson skills "$skills" \
        '{uid:$uid,username:$username,platforms:$platforms,games:$games,skills:$skills,
          platform_games:{Steam:$games},has_skills_profile:($skills|length>0),onboarding_complete:true}'
}

request POST "$TOKEN_A" '/rest/v1/users' "$(profile "$UID_A" "Alice${RUN_ID}" '["Steam","Epic Games"]' '["Fortnite","Portal 2"]' '["Coaching"]')" >/dev/null
request POST "$TOKEN_B" '/rest/v1/users' "$(profile "$UID_B" "Bob${RUN_ID}" '["PlayStation"]' '["Fortnite"]' '["Tournaments"]')" >/dev/null
request POST "$TOKEN_C" '/rest/v1/users' "$(profile "$UID_C" "Carol${RUN_ID}" '["Nintendo"]' '["Mario Kart 8 Deluxe"]' '[]')" >/dev/null
echo "E2E stage: profiles created"

legacy_subscription='[{"name":"Discord","icon_name":"bubble.left.fill","url":"https://example.test/invite","details":"family access","shared_slots":4}]'
request PATCH "$TOKEN_A" "/rest/v1/users?uid=eq.$UID_A" "$(jq -n --argjson subscriptions "$legacy_subscription" '{subscriptions:$subscriptions}')" >/dev/null
sanitized_profile=$(request GET "$TOKEN_A" "/rest/v1/users?uid=eq.$UID_A&select=subscriptions" '')
assert "$sanitized_profile" '.[0].subscriptions[0] | has("url") == false and has("details") == false and has("shared_slots") == false'

APNS_TOKEN=$(printf '%064x' "$RUN_ID")
request POST "$TOKEN_A" '/rest/v1/rpc/register_device_token' "$(jq -n --arg token "$APNS_TOKEN" '{device_token:$token,token_environment:"sandbox"}')" >/dev/null
own_tokens=$(request GET "$TOKEN_A" '/rest/v1/device_tokens?select=token,environment' '')
assert "$own_tokens" 'length == 1 and .[0].environment == "sandbox"'
other_tokens=$(request GET "$TOKEN_B" '/rest/v1/device_tokens?select=token' '')
assert "$other_tokens" 'length == 0'
request POST "$TOKEN_A" '/rest/v1/rpc/unregister_device_token' "$(jq -n --arg token "$APNS_TOKEN" '{device_token:$token}')" >/dev/null
own_tokens=$(request GET "$TOKEN_A" '/rest/v1/device_tokens?select=token' '')
assert "$own_tokens" 'length == 0'
echo "E2E stage: push token isolation verified"

feed=$(request POST "$TOKEN_A" '/rest/v1/rpc/get_feed_profiles' '{"kind":"exchange","batch_limit":10}')
assert "$feed" "map(.uid) | contains([\"$UID_B\",\"$UID_C\"])"

request POST "$TOKEN_A" '/rest/v1/rpc/record_swipe' "$(jq -n --arg uid "$UID_C" '{target_uid:$uid,kind:"exchange",swipe_decision:"dislike"}')" >/dev/null
feed=$(request POST "$TOKEN_A" '/rest/v1/rpc/get_feed_profiles' '{"kind":"exchange","batch_limit":10}')
assert "$feed" "map(.uid) | index(\"$UID_C\") == null"
undone=$(request POST "$TOKEN_A" '/rest/v1/rpc/undo_dislike' "$(jq -n --arg uid "$UID_C" '{target_uid:$uid,kind:"exchange"}')")
assert "$undone" '. == true'

like_a=$(request POST "$TOKEN_A" '/rest/v1/rpc/send_like' "$(jq -n --arg uid "$UID_B" '{target_uid:$uid,kind:"exchange",request_id:"ignored-a"}')")
assert "$like_a" '.[0].matched == false'
like_b=$(request POST "$TOKEN_B" '/rest/v1/rpc/send_like' "$(jq -n --arg uid "$UID_A" '{target_uid:$uid,kind:"exchange",request_id:"ignored-b"}')")
assert "$like_b" '.[0].matched == true and .[0].chat_id != null'
CHAT_ID=$(printf '%s' "$like_b" | jq -er '.[0].chat_id')
echo "E2E stage: mutual match created"

blocked_status=$(curl -sS -o "$TMP/blocked-message.json" -w '%{http_code}' -X POST "$API_URL/rest/v1/rpc/send_chat_message" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" -H 'Content-Type: application/json' \
    -d "$(jq -n --arg chat "$CHAT_ID" '{message_id:"blocked-account-sale",target_chat_id:$chat,message_text:"sell my Steam account",message_image_url:null}')")
[ "$blocked_status" = 400 ] || {
    echo "Prohibited account-sale message was not blocked (HTTP $blocked_status)" >&2
    cat "$TMP/blocked-message.json" >&2
    exit 1
}

request POST "$TOKEN_A" '/rest/v1/rpc/send_chat_message' "$(jq -n --arg chat "$CHAT_ID" --arg message "e2e-message-$RUN_ID" '{message_id:$message,target_chat_id:$chat,message_text:"Hello from E2E",message_image_url:null}')" >/dev/null
messages=$(request GET "$TOKEN_B" "/rest/v1/messages?chat_id=eq.$CHAT_ID&select=*" '')
assert "$messages" 'length == 1 and .[0].text == "Hello from E2E"'
request POST "$TOKEN_B" '/rest/v1/rpc/mark_chat_read' "$(jq -n --arg chat "$CHAT_ID" '{target_chat_id:$chat}')" >/dev/null
messages=$(request GET "$TOKEN_A" "/rest/v1/messages?chat_id=eq.$CHAT_ID&select=*" '')
assert "$messages" ".[0].read_by | contains([\"$UID_A\",\"$UID_B\"])"
echo "E2E stage: chat and read receipts verified"

report=$(jq -n --arg reporter "$UID_A" --arg subject "$UID_C" '{reporter_id:$reporter,subject_id:$subject,reason:"Fake profile",details:"Automated E2E report"}')
request POST "$TOKEN_A" '/rest/v1/reports' "$report" >/dev/null
block=$(jq -n --arg blocker "$UID_A" --arg blocked "$UID_C" '{blocker_id:$blocker,blocked_id:$blocked}')
request POST "$TOKEN_A" '/rest/v1/blocks' "$block" >/dev/null

forged=$(request PATCH "$TOKEN_A" "/rest/v1/users?uid=eq.$UID_B" '{"username":"ForgedName"}')
assert "$forged" 'length == 0'

printf '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EF//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EF//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EF//2Q==' | base64 -D > "$TMP/avatar.jpg"
curl -fsS -X POST "$API_URL/storage/v1/object/avatars/$UID_A/avatar.jpg" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_A" \
    -H 'Content-Type: image/jpeg' -H 'x-upsert: true' --data-binary @"$TMP/avatar.jpg" >/dev/null
echo "E2E stage: avatar storage verified"

catalog=$(request POST "$TOKEN_A" '/functions/v1/game-search' '{"query":"Fortnite"}')
assert "$catalog" '.results | length > 0 and .[0].name != null'
echo "E2E stage: game catalog verified"

deleted=$(request POST "$TOKEN_A" '/functions/v1/delete-account' '{"confirmation":"DELETE"}')
assert "$deleted" '.deleted == true'
remaining_chat=$(request GET "$TOKEN_B" "/rest/v1/chats?id=eq.$CHAT_ID&select=id" '')
assert "$remaining_chat" 'length == 0'

for token in "$TOKEN_B" "$TOKEN_C"; do
    deleted=$(request POST "$token" '/functions/v1/delete-account' '{"confirmation":"DELETE"}')
    assert "$deleted" '.deleted == true'
done

echo "UniShare multi-user Supabase E2E passed"
