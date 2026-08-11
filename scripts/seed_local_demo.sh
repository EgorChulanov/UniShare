#!/bin/sh
set -eu

need() { command -v "$1" >/dev/null || { echo "Missing command: $1" >&2; exit 1; }; }
need curl
need jq
need supabase
need psql

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
"$ROOT/scripts/start_local_supabase.sh" >/dev/null
supabase db reset >/dev/null
STATUS=$(supabase status -o env)
API_URL=$(printf '%s\n' "$STATUS" | sed -n 's/^API_URL="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
ANON_KEY=$(printf '%s\n' "$STATUS" | sed -n 's/^ANON_KEY="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
DB_URL=$(printf '%s\n' "$STATUS" | sed -n 's/^DB_URL="\{0,1\}\([^"[:space:]]*\)"\{0,1\}$/\1/p')
[ -n "$API_URL" ] && [ -n "$ANON_KEY" ] && [ -n "$DB_URL" ] || {
    echo "Local Supabase credentials are unavailable" >&2
    exit 1
}

PASSWORD=${UNISHARE_DEMO_PASSWORD:-UniShare-Demo-2026!}
TMP=$(mktemp -d "${TMPDIR:-/tmp}/unishare-demo.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM

auth_session() {
    email=$1
    signup_file="$TMP/signup.json"
    code=$(curl -sS -o "$signup_file" -w '%{http_code}' "$API_URL/auth/v1/signup" \
        -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
        -d "$(jq -n --arg email "$email" --arg password "$PASSWORD" '{email:$email,password:$password}')")
    if [ "$code" -ge 200 ] && [ "$code" -lt 300 ] && jq -e '.access_token' "$signup_file" >/dev/null 2>&1; then
        jq -r '[.user.id,.access_token] | join("|")' "$signup_file"
        return
    fi

    login_file="$TMP/login.json"
    curl -fsS -o "$login_file" "$API_URL/auth/v1/token?grant_type=password" \
        -H "apikey: $ANON_KEY" -H 'Content-Type: application/json' \
        -d "$(jq -n --arg email "$email" --arg password "$PASSWORD" '{email:$email,password:$password}')"
    jq -er '[.user.id,.access_token] | join("|")' "$login_file"
}

request() {
    method=$1 token=$2 path=$3 body=${4:-}
    if [ -n "$body" ]; then
        curl -fsS -X "$method" "$API_URL$path" \
            -H "apikey: $ANON_KEY" -H "Authorization: Bearer $token" \
            -H 'Content-Type: application/json' -H 'Prefer: return=representation,resolution=merge-duplicates' \
            -d "$body"
    else
        curl -fsS -X "$method" "$API_URL$path" \
            -H "apikey: $ANON_KEY" -H "Authorization: Bearer $token" \
            -H 'Content-Type: application/json'
    fi
}

REVIEWER=$(auth_session reviewer@unishare.test)
LUNA=$(auth_session luna@unishare.test)
ALEX=$(auth_session alex@unishare.test)
MARINA=$(auth_session marina@unishare.test)
IFS='|' read -r REVIEWER_ID REVIEWER_TOKEN <<EOF
$REVIEWER
EOF
IFS='|' read -r LUNA_ID LUNA_TOKEN <<EOF
$LUNA
EOF
IFS='|' read -r ALEX_ID ALEX_TOKEN <<EOF
$ALEX
EOF
IFS='|' read -r MARINA_ID MARINA_TOKEN <<EOF
$MARINA
EOF

upsert_profile() {
    uid=$1 token=$2 username=$3 status=$4 platform=$5 games=$6 wanted=$7 skills=$8
    body=$(jq -n \
        --arg uid "$uid" --arg username "$username" --arg status "$status" --arg platform "$platform" \
        --argjson games "$games" --argjson wanted "$wanted" --argjson skills "$skills" \
        '{uid:$uid,username:$username,status:$status,platforms:[$platform],games:$games,wanted_games:$wanted,
          platform_games:{($platform):$games},skills:$skills,skills_description:"Ищу спокойную командную игру без токсичности",
          has_skills_profile:true,onboarding_complete:true,is_online:true,last_seen:(now|todateiso8601)}')
    request POST "$token" '/rest/v1/users?on_conflict=uid' "$body" >/dev/null
}

upsert_profile "$REVIEWER_ID" "$REVIEWER_TOKEN" "EgorReview" "Открыт для кооператива вечером" "PC" \
    '["Fortnite","Portal 2","Helldivers 2"]' '["Split Fiction","Baldur’s Gate 3"]' '["Team play","Strategy"]'
upsert_profile "$LUNA_ID" "$LUNA_TOKEN" "LunaNova" "Ranked без давления" "PlayStation" \
    '["Fortnite","Overwatch 2","It Takes Two"]' '["Split Fiction"]' '["Support","Coaching"]'
upsert_profile "$ALEX_ID" "$ALEX_TOKEN" "AlexOrbit" "Кооператив и хорошие истории" "Xbox" \
    '["Minecraft","Sea of Thieves","Forza Horizon 5"]' '["Grounded 2"]' '["Builder","Navigator"]'
upsert_profile "$MARINA_ID" "$MARINA_TOKEN" "MarinaPixel" "Nintendo weekends" "Nintendo" \
    '["Mario Kart 8 Deluxe","Animal Crossing: New Horizons"]' '["Super Mario Party Jamboree"]' '["Racing","Creative"]'

match_users() {
    first_token=$1 first_target=$2 second_token=$3 second_target=$4
    request POST "$first_token" '/rest/v1/rpc/send_like' \
        "$(jq -n --arg uid "$first_target" '{target_uid:$uid,kind:"exchange",request_id:"demo"}')" >/dev/null
    result=$(request POST "$second_token" '/rest/v1/rpc/send_like' \
        "$(jq -n --arg uid "$second_target" '{target_uid:$uid,kind:"exchange",request_id:"demo"}')")
    printf '%s' "$result" | jq -er '.[0].chat_id'
}

CHAT_LUNA=$(match_users "$REVIEWER_TOKEN" "$LUNA_ID" "$LUNA_TOKEN" "$REVIEWER_ID")
CHAT_ALEX=$(match_users "$REVIEWER_TOKEN" "$ALEX_ID" "$ALEX_TOKEN" "$REVIEWER_ID")

request POST "$LUNA_TOKEN" '/rest/v1/rpc/send_chat_message' \
    "$(jq -n --arg chat "$CHAT_LUNA" '{message_id:"demo-luna-hello",target_chat_id:$chat,message_text:"Привет! Сыграем сегодня в 20:00?",message_image_url:null}')" >/dev/null
request POST "$REVIEWER_TOKEN" '/rest/v1/rpc/send_chat_message' \
    "$(jq -n --arg chat "$CHAT_LUNA" '{message_id:"demo-reviewer-reply",target_chat_id:$chat,message_text:"Да, добавил тебя в команду",message_image_url:null}')" >/dev/null
request POST "$ALEX_TOKEN" '/rest/v1/rpc/send_chat_message' \
    "$(jq -n --arg chat "$CHAT_ALEX" '{message_id:"demo-alex-hello",target_chat_id:$chat,message_text:"Готов к Sea of Thieves на выходных",message_image_url:null}')" >/dev/null

psql "$DB_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
insert into public.stories (
    id, title, subtitle, body, symbol, accent_hex, cta_title, cta_url,
    priority, is_active, published_at, expires_at
) values
    ('10000000-0000-4000-8000-000000000001', 'Безопасная команда', 'Как общаться без риска', 'Никогда не передавайте пароль, коды подтверждения или платёжные данные.', 'lock.shield.fill', '176B87', 'Открыть ленту', 'unishare://feed', 100, true, now(), now() + interval '30 days'),
    ('10000000-0000-4000-8000-000000000002', 'Игра недели', 'Split Fiction', 'Находите напарника для совместного прохождения и сохраняйте прогресс вместе.', 'sparkles', '31A8FF', 'Найти игрока', 'unishare://feed', 90, true, now(), now() + interval '30 days'),
    ('10000000-0000-4000-8000-000000000003', 'AirShare', 'Познакомьтесь рядом', 'Откройте AirShare и встряхните iPhone рядом с другим игроком.', 'wave.3.right.circle.fill', '64D8CB', 'Попробовать', 'unishare://airshare', 80, true, now(), now() + interval '30 days')
on conflict (id) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    body = excluded.body,
    symbol = excluded.symbol,
    accent_hex = excluded.accent_hex,
    cta_title = excluded.cta_title,
    cta_url = excluded.cta_url,
    priority = excluded.priority,
    is_active = excluded.is_active,
    published_at = excluded.published_at,
    expires_at = excluded.expires_at;
SQL

cat <<EOF
Local UniShare demo data is ready.
Email: reviewer@unishare.test
Password: $PASSWORD
Recreate this deterministic dataset with: make backend-demo
EOF
