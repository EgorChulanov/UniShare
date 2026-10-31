# UniShare Cloud: Telegram, VK, Web and future mobile apps

This folder holds UniShare's cross-platform version. A single codebase and a single database serve:

| Surface | How it runs |
| --- | --- |
| **Telegram Mini App** | Bot [@UniversalShareBot](https://t.me/UniversalShareBot): the menu button, `/start`, deep links `t.me/<bot>?startapp=…` |
| **VK Mini App** | `vk.com/app<ID>` (in the VK catalog, so people can find it through search) |
| **Website / PWA** | `https://<domain>`: sign in with Telegram, install it to the home screen on iOS and Android |
| **iOS / Android (later)** | The same web client wrapped in Capacitor, or the native Swift app talking to the same API |

The native SwiftUI app stays in [`../UniShare`](../UniShare). Everything in `cloud/` is independent of Xcode.

## Architecture

```text
cloud/
├── shared/          # TypeScript contract for every client: API types, platform/subscription
│                    #   catalog, validation, deep links, i18n imported from the iOS strings
├── server/          # Node.js 22 + Fastify API, WebSocket realtime, Telegram bot (grammY),
│   ├── migrations/  #   VK callbacks, PostgreSQL migrations, file storage (disk or S3)
│   └── test/        # signature tests + end-to-end API scenario on real PostgreSQL
├── web/             # React 19 + Vite client: one adaptive "Liquid Glass" UI for
│                    #   Telegram, VK, the browser and tablets/desktop
├── deploy/          # docker-compose (PostgreSQL + app + Caddy HTTPS + nightly backups),
│                    #   Caddyfile, one-command VPS installer
└── Dockerfile       # one image: Mini App + website + API + bot webhook
```

```text
 Telegram ─┐                        ┌─ PostgreSQL (accounts, profiles, chats…)
 VK ───────┼──▶ HTTPS (Caddy) ──▶ UniShare server ─┼─ Disk / S3 (avatars, chat photos)
 Browser ──┘        REST + WebSocket   │           └─ Steam / Wikipedia / RAWG (game covers, cached)
                                       └─▶ Telegram Bot API / VK API (notifications)
```

### Accounts across platforms
- The **Telegram** sign-in is verified on the server with an HMAC over `initData` signed with the bot token.
- The **VK** sign-in is verified on the server through the `sign` launch-params signature, keyed with the app secret.
- The **website** signs in through the Telegram Login Widget. It stays hidden until BotFather `/setdomain` points at the site and `TELEGRAM_LOGIN_WIDGET=true` is set; until then the site sends people to the bot or the VK app.
- Every sign-in method is a row in `user_identities` attached to a single UniShare account. **Settings → Linked accounts** creates a 15-minute link token, shown as a link. Opening it in the other app attaches that identity to the same profile.
- After a match, a partner can show their Telegram or VK contact by turning on **“Show my contacts to chat partners”**. The button **“Message on Telegram”** then appears, in the spirit of Dayvinchik, while conversations still stay in UniShare.

### Notifications
- The **bot** sends match, like and message notifications, with an **“Open UniShare”** button that opens the right chat.
- Message notifications are throttled and skipped while the recipient is online.
- **VK** notifications go out through community messages, after `VKWebAppAllowMessagesFromGroup`.

### Games, avatars and Steam
- **Game search** understands Russian names, slang and abbreviations ("гта 6", "кс 2", "ведьмак"; `shared/src/aliases.ts`) and shows one card per game.
- **Steam import:** a player signs in through Steam (or pastes a profile link) and picks games from their library. Needs `STEAM_API_KEY`. PlayStation, Xbox, Nintendo and Epic have no public library API.
- **Avatars:** art from the player's own games, an original UniShare set, or an uploaded photo.

### Moderation and admin panel
- **Settings → Report a problem** sends a bug report with device details and an optional screenshot.
- Admins open **Settings → Admin panel**: users and activity, database size and the latest backup, user reports, bug reports, user search with ban / suspend / unban, and an audit log. Admins also get a Telegram message for every new report, with Ban / Reject buttons.
- To become the first admin, set `ADMIN_CLAIM_CODE` and send `/admin <code>` to the bot from your Telegram account (it must have opened the Mini App once).

### Telegram features used
- **Display:** full-screen mode (Bot API 8.0), safe areas, swipe-to-close disabled, theme colors.
- **Native controls:** the BackButton, haptics, and closing confirmation during onboarding.
- **Device features:** `LocationManager` for AirShare and home-screen shortcuts.
- **Bot setup:** the menu button, commands and descriptions are configured automatically.
- **Sharing:** `shareMessage` with prepared inline messages (Bot API 8.0) and `requestWriteAccess`.

## Local development

You need Node.js 22+ and PostgreSQL 14+ (or Docker).

```bash
cd cloud
cp .env.example .env              # for local work only DATABASE_URL is needed; DEV_AUTH is on by default
npm install
npm run dev                       # API on :8080, web client on :5173 (proxied /api, /media, /ws)
```

Open http://localhost:5173 and use **Test sign-in** (dev-only, disabled in production).

To try it inside Telegram during development:
1. Expose the Vite server over HTTPS, for example `cloudflared tunnel --url http://localhost:5173`.
2. Set `PUBLIC_URL` to that address and `TELEGRAM_BOT_MODE=polling`.
3. Restart the server; the bot menu button will point to your tunnel.

## Tests

```bash
npm run typecheck
./scripts/test.sh                 # starts a throwaway PostgreSQL in Docker (or set DATABASE_URL)
```

`server/test/api.test.ts` drives the whole flow through the HTTP API:
- **Sign-in and profile:** Telegram/VK sign-in, onboarding, moderation of passwords and payment data.
- **Matching and chat:** feed ranking, like → request → match, chat, read receipts, direct contacts.
- **Trust and safety:** reviews, reports and blocks.
- **Accounts:** linking VK to a Telegram account, and account deletion.

## Production

The step-by-step guide in Russian, covering BotFather, VK, Yandex Cloud and the domain, is [`../docs/LAUNCH_GUIDE_RU.md`](../docs/LAUNCH_GUIDE_RU.md).

The short version for an Ubuntu VM:

```bash
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/EgorChulanov/UniShare/main/cloud/deploy/setup-vps.sh)"
```

| Variable | Purpose |
| --- | --- |
| `PUBLIC_URL`, `DOMAIN` | HTTPS address of the app (Telegram and VK require HTTPS) |
| `SESSION_SECRET` | ≥32 random characters |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Bot from @BotFather |
| `TELEGRAM_LOGIN_WIDGET` | `true` once BotFather `/setdomain` points at `PUBLIC_URL` (shows the Login Widget on the website) |
| `VK_APP_ID`, `VK_APP_SECRET` | VK Mini App ID and secure key |
| `VK_GROUP_ID`, `VK_GROUP_TOKEN` | Optional VK community for notifications |
| `STORAGE_DRIVER=s3`, `S3_*` | Yandex Object Storage instead of the local disk |
| `DATABASE_URL`, `DATABASE_SSL` | External database (for example, Yandex Managed PostgreSQL) |
| `RAWG_API_KEY` | Game covers. Without it, a built-in list of titles is used |
| `TELEGRAM_WEBHOOK_SECRET` | Random string checked on every webhook call. Without it the Ban / Reject buttons in admin notifications are off |
| `ADMIN_CLAIM_CODE` | Long random code; send `/admin <code>` to the bot once to become admin (each value works once) |
| `STEAM_API_KEY` | Steam Web API key (https://steamcommunity.com/dev/apikey, domain = `PUBLIC_URL` host). Turns on "Import from Steam" |
| `BACKUPS_DIR` | Folder with the nightly `*.sql.gz` dumps shown in the admin panel (compose mounts it at `/data/backups`) |

Any of these can also be set without shell access as `KEY=value` lines in the Yandex Cloud VM metadata attribute `unishare-env`; the server reads it at startup.

## Future native apps

The web client is already a PWA and keeps every platform call behind one adapter (`web/src/platform/platform.ts`). Two paths exist for App Store / Google Play builds:
1. **Capacitor:** wrap `web/dist`, add a `capacitor` adapter (push via APNs/FCM, native share), and set `VITE_API_URL` to the production API.
2. **Native SwiftUI:** point the existing iOS app at this API instead of Supabase; the contract lives in `shared/src/types.ts`.

The [API reference](docs/API.md) lists every endpoint, the realtime protocol, uploads and rate limits. It also describes what a native sign-in hand-off still needs (Telegram and VK credentials today come only from inside those apps or the Telegram widget on the bot's domain).

Either way, users, chats and matches stay shared across Telegram, VK, the web and mobile.
