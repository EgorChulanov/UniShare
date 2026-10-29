#!/usr/bin/env bash
# One-command installer for an Ubuntu 22.04/24.04 VM (Yandex Cloud Compute,
# Timeweb Cloud, Selectel, VK Cloud...). Installs Docker, asks for the
# required settings, writes cloud/.env and starts UniShare with HTTPS.
#
#   curl -fsSL https://raw.githubusercontent.com/EgorChulanov/UniShare/main/cloud/deploy/setup-vps.sh | sudo bash
#   (or, inside a clone: sudo bash cloud/deploy/setup-vps.sh)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/EgorChulanov/UniShare.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/unishare}"

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ask() {
  local prompt="$1" default="${2:-}" value
  if [ -n "$default" ]; then read -r -p "$prompt [$default]: " value </dev/tty; else read -r -p "$prompt: " value </dev/tty; fi
  printf '%s' "${value:-$default}"
}

if [ "$(id -u)" -ne 0 ]; then echo "Run as root: sudo bash $0" >&2; exit 1; fi

say "Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

say "Fetching UniShare"
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch origin "$BRANCH" && git -C "$INSTALL_DIR" checkout "$BRANCH" && git -C "$INSTALL_DIR" pull --ff-only
else
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR/cloud"

if [ ! -f .env ]; then
  say "Configuration"
  public_ip="$(curl -fsS https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
  echo "You need a domain (A record → $public_ip) for HTTPS. Without one you can use ${public_ip//./-}.sslip.io"
  domain="$(ask "Domain" "${public_ip//./-}.sslip.io")"
  bot_token="$(ask "Telegram bot token from @BotFather (leave empty to skip)")"
  bot_username="$(ask "Telegram bot username" "UniversalShareBot")"
  vk_app_id="$(ask "VK Mini App ID (leave empty to skip)")"
  vk_secret=""
  if [ -n "$vk_app_id" ]; then vk_secret="$(ask "VK app secure key (Защищённый ключ)")"; fi
  rawg_key="$(ask "RAWG API key for game covers (optional)")"

  cat > .env <<EOF
PUBLIC_URL=https://$domain
DOMAIN=$domain
SESSION_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 18)
TELEGRAM_BOT_TOKEN=$bot_token
TELEGRAM_BOT_USERNAME=$bot_username
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 16)
TELEGRAM_BOT_MODE=webhook
VK_APP_ID=$vk_app_id
VK_APP_SECRET=$vk_secret
STORAGE_DRIVER=local
RAWG_API_KEY=$rawg_key
SUPPORT_EMAIL=official@egorchulanov.ru
EOF
  chmod 600 .env
  echo "Saved $INSTALL_DIR/cloud/.env (edit it any time, then rerun this script)."
fi

say "Building and starting containers"
cd deploy
docker compose --env-file ../.env up -d --build

say "Waiting for the app"
for _ in $(seq 1 60); do
  if docker compose --env-file ../.env exec -T app wget -qO- http://127.0.0.1:8080/health >/dev/null 2>&1; then break; fi
  sleep 3
done
docker compose --env-file ../.env ps

domain="$(grep '^DOMAIN=' ../.env | cut -d= -f2)"
cat <<EOF

✅ UniShare is running: https://$domain
   Logs:     cd $INSTALL_DIR/cloud/deploy && docker compose --env-file ../.env logs -f app
   Update:   sudo bash $INSTALL_DIR/cloud/deploy/setup-vps.sh
   Backups:  docker volume "unishare_backups" (nightly pg_dump, 14 days)

The Telegram bot (commands, menu button and webhook) is configured automatically on start.
EOF
