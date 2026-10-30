# UniShare Cloud API reference

This is the HTTP and WebSocket API of the UniShare cloud server (`cloud/server`). It is written for the native iOS (SwiftUI) and Android apps that will join the Telegram, VK and web clients on the same database: the same accounts, profiles, likes and chats.

Everything here was checked against the server code (`server/src`) and the shared contract (`shared/src`). If this page and the code disagree, the code wins.

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Endpoints](#3-endpoints)
4. [Realtime](#4-realtime)
5. [Uploads and media](#5-uploads-and-media)
6. [Rate limits](#6-rate-limits)

## 1. Overview

### Base URL

| Environment | Base URL |
| --- | --- |
| Production | The server's `PUBLIC_URL`, for example `https://51-250-76-125.sslip.io` |
| Local | `http://localhost:8080` (`npm run dev` in `cloud/`) |

- All API routes live under `/api/`. The exceptions are `/health`, `/media/avatars/...` and the bot webhooks. Other `GET` paths serve the web client ([Web client and CORS](#web-client-and-cors)).
- Ship the base URL in the app. `GET /api/config` also returns it as `publicUrl`.

### Format
- **JSON** in and out, UTF-8. Image uploads are the only bodies that are not JSON (raw bytes, see [section 5](#5-uploads-and-media)).
- **Timestamps** are ISO 8601 strings in UTC with milliseconds, for example `2026-10-30T12:00:00.000Z`.
- **Ids** (users, chats, messages, requests, stories) are lowercase UUID strings.
- **Missing values** are usually `null`. A few optional keys can be left out (for example `MyProfile.suggestions`, `AuthResponse.linked`, `ApiErrorBody.code`), so decode the optional fields of `types.ts` as optional.
- **No schemas:** handlers read the fields they need and ignore the rest. Send the exact JSON types shown here (numbers as numbers, booleans as booleans). Fields that are coerced or cut silently are noted per endpoint.
- **Body limit:** 1 MiB for JSON.
- **Requests without a body:** send no body and no `Content-Type` header. `Content-Type: application/json` with an empty body is rejected with `400 FST_ERR_CTP_EMPTY_JSON_BODY`. This matters for the bodyless `POST` and `DELETE` routes (logout, link token, accept, read, story view, AirShare leave and others).
- **Relative media paths:** `avatarUrl` can be `/media/avatars/...` and chat photos are `/api/media/chats/...`. Resolve them against the base URL.
- **Headers:** every response has `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`. CORS (`CORS_ORIGINS`, see [Web client and CORS](#web-client-and-cors)) only matters for browsers, native apps can ignore it.

### Shared contract
`shared/src/types.ts` is the contract for every client. Type names on this page (`MyProfile`, `ProfileCard`, `ChatMessage` and so on) refer to it. Mirror them as Swift `Codable` or Kotlin `@Serializable` types. Responses without a named type are written inline below.

| File | What it holds |
| --- | --- |
| `shared/src/types.ts` | Request and response types, `ApiErrorBody`, `RealtimeEvent`, `RealtimeCommand` |
| `shared/src/catalog.ts` | `PLATFORMS`, `DiscoveryKind` (`teammates`, `skills`), billing cycles, `REPORT_REASONS`, `LIMITS` |
| `shared/src/validation.ts` | Username pattern and game name rules |
| `shared/src/links.ts` | Deep link payloads and link builders |

### Authentication header
Every endpoint needs a session, except sign-in, `GET /api/config`, `/health`, media files, webhooks and the web client routes:

```http
Authorization: Bearer <token>
```

The prefix is exactly `Bearer ` (case-sensitive). There are no cookies. The WebSocket takes the same token as a query parameter ([section 4](#4-realtime)).

### Deep links
Every client understands the same compact payloads (`shared/src/links.ts`):

| Payload | Opens |
| --- | --- |
| `u_<uid without dashes>` | A profile |
| `c_<chatId without dashes>` | A chat |
| `l_<link token>` | Account linking |
| `s_feed`, `s_chats`, `s_profile`, `s_nearby` | A screen |

They travel as `t.me/<bot>[/<app>]?startapp=<payload>`, `vk.com/app<id>#<payload>`, or on the web as `PUBLIC_URL/?startapp=<payload>` and `PUBLIC_URL/u/<uid>`. Telegram bot notifications open `PUBLIC_URL/?startapp=<payload>` through a Mini App button. Universal links (iOS) and App Links (Android) on `PUBLIC_URL` would let the native apps open these too.

### Errors
Errors come back as `ApiErrorBody`:

```json
{ "error": "Too many actions, please slow down", "code": "rate_limited" }
```

- `error` is a short English message for logs. It is not localized, so show your own strings.
- `code` is stable when present. Many plain validation errors (`400`) have no `code`; branch on the status then.

| Status | `code` | Meaning |
| --- | --- | --- |
| 400 | none | A required field is missing or has the wrong type (the message names it) |
| 400 | `invalid_value` | The database rejected a value: an id that is not a UUID, a value that breaks a length or check rule |
| 400 | `content_blocked` | Text matches a moderation rule (passwords, payment data, threats, abuse) |
| 400 | `invalid_username`, `platform_required`, `status_too_long`, `skillsDescription_too_long` | Profile validation (`PATCH /api/me`) |
| 400 | `unsupported_image` | A non-empty raw upload body that is not JPEG, PNG or WebP. An empty, missing or non-raw body gets `400 Send the image as the request body` without a code ([section 5](#uploading)) |
| 400 | `last_identity` | The only sign-in method cannot be unlinked |
| 400 | `link_expired` | The link token is unknown, used or expired |
| 400 | `FST_ERR_CTP_EMPTY_JSON_BODY`, `FST_ERR_CTP_INVALID_JSON_BODY` | Empty or malformed JSON body |
| 401 | `unauthorized` | No token, an unknown or expired session, or an account that is no longer active |
| 401 | `invalid_signature` | The sign-in credential failed verification |
| 403 | `forbidden` | Sign-in to a suspended or banned account |
| 404 | `not_found` | Missing, or not visible to you (blocked, inactive, not a member) |
| 409 | `username_taken`, `identity_taken`, `provider_already_linked` | Conflicts |
| 413 | `FST_ERR_CTP_BODY_TOO_LARGE` | The body is over the limit |
| 415 | `FST_ERR_CTP_INVALID_MEDIA_TYPE` | Unsupported `Content-Type` |
| 429 | `rate_limited` | A rate limit was hit ([section 6](#6-rate-limits)) |
| 500 | none | `Internal server error` |
| 503 | none | That sign-in provider is not configured on this server |

Less regular cases:
- `404` without a code: dev sign-in turned off (`Not found`), missing media files, and unknown `GET /api/...` and `GET /media/...` paths when the server also serves the web client.
- Other unknown routes (other methods, or any path when no web build is served) return Fastify's default shape `{ "message", "error": "Not Found", "statusCode": 404 }`.
- Signed media URLs answer `403 { "error": "Link expired" }`.
- On upload routes, `413` and `415` are returned before the session is checked.

## 2. Authentication

### Sessions
- Every sign-in endpoint returns `AuthResponse`:
  ```ts
  { token: string; profile: MyProfile; isNewUser: boolean; linked?: "telegram" | "vk" }
  ```
- `token` is an opaque 43-character base64url string (32 random bytes). The server stores only an HMAC of it, so a lost token cannot be recovered. Keep it in the Keychain or in Keystore-backed storage.
- **Lifetime:** `SESSION_DAYS`, 60 days by default, and sliding. Each authenticated request moves the expiry to now + 60 days (at most once an hour per session). An app opened at least once every 60 days stays signed in.
- Every sign-in creates a new session. Sessions on other devices stay valid, and there is no "sign out everywhere" endpoint.
- Each session records which client created it: `telegram`, `vk` or `web` (`ClientPlatform`). The database accepts only these three values today.
- When an account is suspended or banned, its sessions start getting `401 unauthorized` and a new sign-in gets `403 forbidden` ("This account is suspended").
- Treat `401` from any non-auth endpoint as signed out: drop the token and show sign-in. The web client does the same.

### New accounts and onboarding
- The first sign-in creates an account with `onboardingComplete: false` and returns `isNewUser: true`. The account language comes from the platform language (`en`, `uk` or `be`, otherwise `ru`).
- Until onboarding is done, `profile.suggestions` holds a username and an avatar URL taken from the platform account.
- Finish with `PATCH /api/me` carrying `username`, at least one entry in `platforms`, and `onboardingComplete: true`.
- Profiles that have not finished onboarding are invisible to everyone else (feed, search, AirShare, profile pages).
- Likes are the exception. `POST /api/feed/swipe` checks onboarding only for the target, not for the caller, so an unfinished profile can still like someone. That like shows up in the target's `request` event and in `GET /api/requests`, and accepting it opens a chat with the unfinished profile. Keep the feed behind onboarding in the app.

### Sign-in methods

| Method | Endpoint | Credential | Session `client` | Who can produce the credential |
| --- | --- | --- | --- | --- |
| Telegram Mini App | `POST /api/auth/telegram` | `initData` | `telegram` | Telegram apps, inside the Mini App |
| Telegram Login Widget | `POST /api/auth/telegram-widget` | Widget user object | `web` | The widget on a page of the bot's domain (BotFather `/setdomain`) |
| VK Mini App | `POST /api/auth/vk` | Launch params | `vk` | VK apps, inside the Mini App |
| Dev | `POST /api/auth/dev` | A name | `web` | Anyone, only while `DEV_AUTH` is on |

All four take an optional `linkToken` (see [Account linking](#account-linking)). None of them is rate limited.

**Telegram Mini App:** `POST /api/auth/telegram`
- Body: `{ "initData": string, "linkToken"?: string }`. `initData` is the raw `Telegram.WebApp.initData` string, up to 8192 characters.
- Checked with HMAC-SHA256, as Telegram documents for Mini Apps: the secret key is the HMAC-SHA256 of the bot token keyed with `WebAppData`. `auth_date` must be at most `TELEGRAM_INIT_DATA_MAX_AGE` seconds old (default 86400, `0` turns the check off). `user` must carry a positive integer `id`.
- Saved from the Telegram user: username, display name (first and last name, up to 120 characters), `photo_url` (https only), language. `allows_write_to_pm: true` lets the bot message the user.
- Errors: `503` (no bot token), `400 initData is required`, `401 invalid_signature` (the message says why, for example "Telegram session expired, reopen the app").

**Telegram Login Widget:** `POST /api/auth/telegram-widget`
- Body: `{ "payload": object, "linkToken"?: string }`. `payload` is the user object the widget passes to its callback (`id`, `first_name`, `last_name`, `username`, `photo_url`, `auth_date`, `hash`). Pass it on unchanged: the hash covers every field that is not null.
- Checked with HMAC-SHA256 under the key `SHA256(bot token)`. `auth_date` must be at most 24 hours old (fixed).
- It is the same Telegram identity as the Mini App, so both lead to the same account. The widget carries no language and no messaging permission.
- Errors: `503`, `400 payload is required`, `401 invalid_signature`.

**VK Mini App:** `POST /api/auth/vk`
- Body: `{ "launchParams": string, "user"?: { firstName, lastName, photoUrl, screenName }, "linkToken"?: string }`. `launchParams` is the launch query string (a leading `?` is fine), up to 4096 characters.
- `sign` must equal the base64url HMAC-SHA256 (keyed with `VK_APP_SECRET`) of the sorted `vk_*` params, and `vk_user_id` must be a positive integer.
- `vk_app_id` must match `VK_APP_ID` only when `VK_APP_ID` is set to a non-zero value. It is optional, also in production, and without it signed launch params from any VK app id are accepted.
- `vk_ts` must be at most 7 days old when it is present and numeric. Signed launch params without `vk_ts`, or with a `vk_ts` that is not a number, pass with no freshness check.
- `user` comes from `VKWebAppGetUserInfo`. It is not verified and only fills in the display name, photo and username.
- Errors: `503 VK sign-in is not configured`, `400 launchParams are required`, `401 invalid_signature`.

**Dev:** `POST /api/auth/dev`
- Body: `{ "name": string, "linkToken"?: string }`. The name is trimmed and cut to 30 characters, and must keep at least 3. The same name (in any case) always opens the same account.
- Available only while `DEV_AUTH` is on: the default outside production, and a production server refuses to start with it. `GET /api/config` reports it as `devAuth`. When it is off: `404 Not found`.
- This is the easiest way to run a native build against a local server.

**Errors shared by all sign-in routes**

| Status | `code` | When |
| --- | --- | --- |
| 400 | `link_expired` | `linkToken` is unknown, used, or older than 15 minutes |
| 409 | `identity_taken` | With a link token: this Telegram or VK account already belongs to another profile that finished onboarding |
| 409 | `provider_already_linked` | With a link token: the target account already has a different Telegram (or VK) account |
| 403 | `forbidden` | The account is suspended or banned |

### Account linking
One UniShare account can hold one Telegram identity and one VK identity.

1. A signed-in client calls `POST /api/me/link-token` and gets `LinkTokenResponse`:
   ```ts
   { token: string; expiresAt: string; telegramUrl: string | null; vkUrl: string | null }
   ```
   The token is 32 characters, single use, and valid for 15 minutes. A new call replaces the previous token.
2. The user opens `telegramUrl` (`https://t.me/<bot>[/<app>]?startapp=l_<token>`) or `vkUrl` (`https://vk.com/app<id>#l_<token>`), or scans it as a QR code on another device.
3. The Mini App on the other platform reads the `l_<token>` deep link and signs in with `linkToken`. The response has `linked: "telegram"` or `"vk"` and a session for the existing account.

- If that Telegram or VK account only owned an unfinished profile, the unfinished profile is deleted and the identity moves over.
- The token is used up only when the sign-in succeeds. A failed attempt leaves it valid.
- `DELETE /api/me/identities/:provider` unlinks a provider. The last identity cannot be removed (`last_identity`). Sessions created through the removed identity stay valid.
- A native app can already do step 1 and open the URLs (they open the Telegram or VK app). Step 3 always happens inside Telegram or VK.

### Sign-out
- `POST /api/auth/logout` (no body) deletes the current session and returns `{ "ok": true }`. Other sessions stay.
- Logout does not close open WebSockets (a socket checks its token only when it connects), so close yours as well.
- `GET /api/auth/session` returns `{ "userId": string, "client": "telegram" | "vk" | "web" }`. It is a cheap way to check a stored token.
- `DELETE /api/me` deletes the whole account (see [Profile](#profile)).

### Signing in from a native app

**What works today**
- No sign-in method is built for native apps. Each production method needs a credential that only Telegram, VK, or the Telegram Login Widget on the bot's own domain can produce.
- The web sign-in page cannot be used for a hand-off. It runs the widget with a JavaScript callback, posts the result to `/api/auth/telegram-widget`, and keeps the token in its own `localStorage` (`unishare.token`). It never redirects to a URL the caller chooses. Opening `PUBLIC_URL` in `ASWebAuthenticationSession` or Custom Tabs signs the user in inside that browser, and the app gets nothing back.
- `/api/auth/telegram-widget` does not check the `Origin` or which client sent the request. Any client holding a valid, fresh widget payload can sign in with it (as `client: "web"`). What is missing is a page on the bot's domain that hands the payload, or a code, back to the app.
- Dev sign-in works against a local or other non-production server.
- Stopgap, not for release: host the web client in an embedded `WKWebView` or Android `WebView`, let the user sign in, then read `localStorage.getItem("unishare.token")` from the page. This depends on the Telegram widget working inside a web view (it may open a popup) and has not been tested.

**Native hand-off: still to be built**

A sketch, using a one-time code with PKCE so the session token never travels in a URL:

1. The app creates a `state` and a PKCE `code_verifier`, then opens `PUBLIC_URL/auth/native?redirect_uri=unishare://auth&state=...&code_challenge=...` in `ASWebAuthenticationSession` (iOS) or Custom Tabs (Android).
2. That new page, served from the bot's domain, shows the Telegram Login Widget. Its callback posts the payload with `codeChallenge` and `redirectUri` to a new `POST /api/auth/native/code`. The server verifies the payload as `/api/auth/telegram-widget` does, finds or creates the account, and stores a hashed one-time code (single use, about 60 seconds, bound to the user, the challenge and the redirect URI).
3. The page redirects to `unishare://auth?code=...&state=...`. The app checks `state`.
4. The app calls a new `POST /api/auth/native/exchange` with `{ code, codeVerifier, platform: "ios" | "android", linkToken? }` and gets the usual `AuthResponse`.

What the server needs for this:
- The page and the two routes, plus an allowlist of redirect URIs (a custom scheme, or a universal link / App Link on `PUBLIC_URL`).
- A migration that adds the new session clients (`sessions.client` accepts only `telegram`, `vk` and `web`), and the same values in `ClientPlatform`.
- A rate limit on both routes. No auth route is limited today.
- **VK:** VK's native login (VK ID) does not produce Mini App launch params, so it needs its own verification route.
- **Sign in with Apple:** App Store review may ask for it next to Telegram and VK login (guideline 4.8). It needs a new provider value (`user_identities.provider` accepts only `telegram`, `vk` and `dev`) and checks of Apple identity tokens.
- **Push:** there is no device token endpoint yet ([section 4](#presence-and-notifications)).

## 3. Endpoints

Every endpoint needs `Authorization: Bearer <token>` unless its table says otherwise. "No body" means no body and no `Content-Type`.

Path ids are UUIDs. On most routes an id that is not a UUID fails with `400 invalid_value`. Chat routes and `GET /api/users/:uid` answer `404` instead.

### Auth

| Method | Path | Auth | Body | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/telegram` | none | `{ initData, linkToken? }` | `AuthResponse` |
| POST | `/api/auth/telegram-widget` | none | `{ payload, linkToken? }` | `AuthResponse` |
| POST | `/api/auth/vk` | none | `{ launchParams, user?, linkToken? }` | `AuthResponse` |
| POST | `/api/auth/dev` | none | `{ name, linkToken? }` | `AuthResponse` |
| POST | `/api/auth/logout` | bearer | no body | `{ ok: true }` |
| GET | `/api/auth/session` | bearer | | `{ userId, client }` |

Details and errors are in [section 2](#2-authentication).

### Profile

| Method | Path | Body or query | Response |
| --- | --- | --- | --- |
| GET | `/api/me` | | `MyProfile` |
| PATCH | `/api/me` | `ProfileUpdate` | `MyProfile` |
| GET | `/api/me/username-available` | `?username=` | `{ available: boolean }` |
| POST | `/api/me/avatar` | Raw image | `{ avatarUrl: string }` |
| DELETE | `/api/me` | no body | `{ ok: true }` |
| POST | `/api/me/link-token` | no body | `LinkTokenResponse` |
| DELETE | `/api/me/identities/:provider` | `telegram` or `vk` | `MyProfile` |
| POST | `/api/me/notifications` | `{ provider, allowed }` | `MyProfile` |
| POST | `/api/me/share/telegram` | no body | `{ preparedMessageId: string \| null }` |
| GET | `/api/users/:uid` | | `{ profile: ProfileCard, likedKinds: DiscoveryKind[] }` |
| GET | `/api/users/:uid/reviews` | | `Review[]` |

**GET /api/me**
- `identities` lists the linked Telegram and VK accounts (dev identities are hidden). `url` is `https://t.me/<username>` (`null` without a username) or `https://vk.com/id<id>`.
- `suggestions` is present only until onboarding is complete.

**PATCH /api/me**

Every field is optional, so send only what changed. The full profile comes back.

| Field | Rules |
| --- | --- |
| `username` | 3 to 30 letters (any script), digits, `_`, `.` or `-`. A leading `@` is removed. Unique, ignoring case (`409 username_taken`). Cannot be cleared. Otherwise `400 invalid_username` |
| `avatarUrl` | `null` clears it. Otherwise an http(s) URL or a `/media/...` path, up to 2048 characters. Any other value is saved as `null` without an error |
| `status` | String or `null`, trimmed, up to 180 characters (`status_too_long`). Empty becomes `null` |
| `platforms` | Array of `Platform`. Unknown values are dropped and the order becomes the `PLATFORMS` order |
| `platformGames` | Object `Platform -> string[]`. Replaces the whole map and rebuilds `games`. Game names: whitespace collapsed, 2 to 80 characters, no control characters, duplicates removed (ignoring case and accents), at most 30 per platform |
| `wantedGames` | `string[]`, same name rules, at most 30 |
| `gameMetadata` | Object of `GameTag`, at most 300 entries. Keys are ignored and rebuilt from the normalized name. `coverUrl` follows the `avatarUrl` rule |
| `skills` | `string[]`. Each one trimmed and cut to 40 characters, at least 2, duplicates removed (ignoring case), at most 20 |
| `skillsDescription` | Like `status`, up to 600 characters (`skillsDescription_too_long`) |
| `hasSkillsProfile`, `allowDirectContact`, `onboardingComplete` | Booleans (other values are coerced) |
| `subscriptions` | Array, only the first 12 are kept. Each item needs a `name` (up to 60). `id` up to 64 characters (generated when missing), `planName` up to 60, `billingCycleId` up to 8 (the catalog uses `1d`, `1m`, `3m`, `6m`, `12m`), `startedAt` and `expiresAt` as dates (stored as ISO), `autoRenew` boolean |
| `language` | `ru`, `en`, `uk` or `be` (otherwise `400 Unsupported language`) |

- `games` is read-only: it is built from `platformGames`.
- Whenever the patch contains `onboardingComplete: true`, the profile needs a username (`400 invalid_username`, "Choose a username first") and at least one platform (`400 platform_required`).
- `username`, `status` and `skillsDescription` go through the moderation rules (`400 content_blocked`).
- Most fields of the wrong type give `400` with a message such as `platforms must be an array` (no code).
- Covers for new games are looked up in the background, so `gameMetadata` can fill in a little later.

**GET /api/me/username-available**
- Ignores case and your own account. It does not check the format, so an invalid name can come back `available: true`. Check the name locally first with the pattern from `shared/src/validation.ts`: `^[\p{L}\p{N}_.-]{3,30}$`.

**POST /api/me/avatar**
- Raw image body up to 5 MiB, see [section 5](#5-uploads-and-media). The new avatar is saved to the profile right away and the previous file is deleted.

**DELETE /api/me**
- Deletes the account with its identities, sessions, swipes, requests, chats, messages, reviews and reports. Media is removed in the background. Chat partners get no realtime event; the chat disappears on their next refresh. This cannot be undone.

**DELETE /api/me/identities/:provider**
- Returns `200` and changes nothing when that provider is not linked (as long as the account has two or more identities).

**POST /api/me/notifications**
- Body: `{ "provider": "telegram" | "vk", "allowed": boolean }`. Records whether the Telegram bot or the VK community may message the user. The Mini Apps call it after `requestWriteAccess` or `VKWebAppAllowMessagesFromGroup`. A missing `allowed` counts as `false`.

**POST /api/me/share/telegram**
- Telegram Mini App only: prepares a message for `Telegram.WebApp.shareMessage`. Returns `{ "preparedMessageId": null }` when the user has no Telegram identity, when no Telegram bot runs on the server (no `TELEGRAM_BOT_TOKEN`, or `TELEGRAM_BOT_MODE=off`, the default outside production), or when the bot call fails. So a local server always returns `null`, even for users with a Telegram identity. Native apps should share `PUBLIC_URL/u/<uid>` instead (`webLink` in `shared/src/links.ts`).

**GET /api/users/:uid**
- Your own profile is always visible. Other profiles are visible when they finished onboarding, are active, and there is no block in either direction. Otherwise `404 Profile is unavailable`.
- `likedKinds` lists the contexts (`teammates`, `skills`) in which you already liked this user.

**GET /api/users/:uid/reviews**
- Reviews the user received, newest first, at most 50: `{ id, fromUid, fromUsername, rating, text, createdAt }`.

### Feed

| Method | Path | Body or query | Response |
| --- | --- | --- | --- |
| GET | `/api/feed` | `?kind=&limit=&exclude=` | `ProfileCard[]` |
| POST | `/api/feed/swipe` | `{ targetId, kind, decision }` | `SwipeResult` |
| POST | `/api/feed/undo` | `{ targetId, kind }` | `{ restored: boolean }` |

**GET /api/feed**
- `kind`: `teammates` (default) or `skills`. `limit`: an integer from 1 to 30, default 12 (a fraction such as `2.5` fails with `400 invalid_value`). `exclude`: comma-separated uids already on screen, at most 60.
- Never returns you, unfinished or inactive profiles, blocked users (either direction), people you liked in this kind, people you disliked in the last 30 days, or people you already have a chat of this kind with. `skills` also requires `hasSkillsProfile`.
- Ranked by shared platforms (x2), their games that you want (x3), their wanted games that you own (x3), shared games (x1), being online (+2) and having an avatar (+1), then by the most recent profile update.

**POST /api/feed/swipe**
- `kind`: `teammates` or `skills` (required). `decision`: `like` or `dislike`.
- `404 Profile is unavailable` when the target is unfinished, inactive or blocked.
- A like sends the target a `request` event, and a bot notification if UniShare is not on their screen.
- A like back to someone who already liked you is a match: the chat is created (or restored), both requests are deleted, and the response is `{ matched: true, chatId }`. The partner gets `match` and `chat` events plus a bot notification. You get a `chat` event.
- Limits (`429 rate_limited`), both checked before the new swipe is stored:
  - **Swipes:** 120 per minute, counted as your stored swipe decisions created or changed in the last minute. There is one decision per target and kind, so repeat swipes on the same target count once. Accepting and declining requests store decisions too, so they count toward the 120 even though those routes have no limit of their own.
  - **Likes:** 40 per minute, counted as your like requests created in the last minute that still exist. Requests are deleted when a like makes a match, when the recipient accepts or declines, and on a block, so those likes stop counting. Liking again a target whose request is still pending refreshes the same request and adds no new one.

**POST /api/feed/undo**
- Removes your `dislike` if it is at most 10 minutes old. Likes cannot be undone. `LIMITS.maxUndoPerDay` (3) is a client rule; the server does not count undos.

### Requests and matches
A match is a chat, so the list of matches is `GET /api/chats`.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/requests` | | `LikeRequestItem[]` |
| POST | `/api/requests/:id/accept` | no body | `{ chatId: string }` |
| DELETE | `/api/requests/:id` | no body | `{ ok: true }` |

- **List:** likes waiting for your answer, newest first, at most 100. Senders who are inactive or blocked are left out. Senders who have not finished onboarding are not ([section 2](#new-accounts-and-onboarding)).
- **Accept:** records your like, creates or restores the chat, and deletes the requests in both directions. The sender gets `match` and `chat` events and a bot notification; you get `chat`. `404 Like request is unavailable` if the request is gone or not addressed to you.
- **Decline:** always `{ ok: true }`, even if the request no longer exists. It records a dislike, so the sender stays out of your feed for 30 days.

### Chats

| Method | Path | Body or query | Response |
| --- | --- | --- | --- |
| GET | `/api/chats` | | `ChatSummary[]` |
| GET | `/api/chats/:id` | | `ChatDetails` |
| GET | `/api/chats/:id/messages` | `?before=&limit=` | `ChatMessage[]` |
| POST | `/api/chats/:id/messages` | `{ id, text?, imageUrl? }` | `ChatMessage` |
| POST | `/api/chats/:id/images` | Raw image | `{ imageUrl: string }` |
| POST | `/api/chats/:id/read` | no body | `{ ok: true }` |
| DELETE | `/api/chats/:id` | no body | `{ ok: true }` |

All chat routes answer `404 Chat is unavailable` when the id is not a UUID, you are not a member, or there is a block between the two of you.

**GET /api/chats**
- Most recent activity first, at most 200, no pagination. Leaves out chats you hid, chats with inactive partners, and blocked pairs.
- `lastMessage` is `""` for a new chat and `"📷"` for a photo without text. `unread` is your own counter.

**GET /api/chats/:id**
- `ChatDetails` is `ChatSummary` plus `canReview` and `contacts`.
- `canReview` is true when you have not reviewed this partner for this chat yet and both of you have sent at least one message.
- `contacts` is filled only when the partner turned on `allowDirectContact`: Telegram (`https://t.me/<username>`, label `@<username>`, only when they have a username) and VK (`https://vk.com/id<id>`, label `VK`).
- Also `404` when the partner's account is no longer active. A chat you hid is still returned here.

**GET /api/chats/:id/messages**
- Returns the newest `limit` messages (default 50, at most 100) created before `before`, sorted oldest to newest.
- For older history, pass the `createdAt` of the oldest message you hold as `before` (an ISO timestamp). A `before` that does not parse is ignored.
- `imageUrl` is a signed relative URL that works for about 24 hours ([section 5](#chat-photos)).

**POST /api/chats/:id/messages**
- `id`: a UUID you generate for each message. It makes sending idempotent: a retry with the same `id` returns the stored message and sends no new events. Without a valid UUID the server makes up its own, and a retry then creates a duplicate.
- `text`: trimmed, up to 1000 characters counted in UTF-16 code units (`text.utf16.count` in Swift, `String.length` in Kotlin). Longer: `400 Message is too long`.
- `imageUrl`: the `imageUrl` returned by `POST /api/chats/:id/images` for this chat. Its query string is dropped. Any other value is ignored without an error.
- At least one of `text` and `imageUrl` is required (`400 Message content is required`).
- Text is moderated (`400 content_blocked`). `400 Duplicate message id` means the id belongs to another user's message.
- Limit: 30 messages per minute across all chats (`429`). Retries do not add to the count, but they are refused with `429` while the limit is reached, even for a message that was already stored.
- After a new message, both of you get a `message` event (match it to your optimistic copy by `id`) and a `chat` event with your own `ChatSummary`. A hidden chat comes back for both. The partner gets a bot notification if UniShare is not on their screen, at most one per chat every 5 minutes.

**POST /api/chats/:id/images**
- Uploads a photo for this chat (raw body up to 10 MiB, [section 5](#5-uploads-and-media)) and returns a signed `imageUrl`. Nothing is sent until you post a message with it. No rate limit.

**POST /api/chats/:id/read**
- Marks the partner's messages as read and resets your `unread` to 0. The partner gets a `read` event if anything changed.
- Your own other devices get no event, so refresh their chat list.

**DELETE /api/chats/:id**
- Hides the chat for you only (swipe to delete). You get `chat_removed`; the partner is not told. A new message or a new match brings the chat back. Once both members have hidden it, the chat, its messages and its photos are deleted.

### Discover and search

| Method | Path | Query | Response |
| --- | --- | --- | --- |
| GET | `/api/search` | `?q=&platform=` | `SearchResults` |
| GET | `/api/players` | `?game=` | `ProfileCard[]` |

**GET /api/search**
- `q` is trimmed and cut to 80 characters. `platform` must be an exact `Platform` name (`Steam`, `Epic Games`, `Nintendo`, `PlayStation`, `Xbox`, `PC`, `Mobile`); anything else is ignored. With neither, every list is empty.
- `users`: substring match, ignoring case, on username, games, wanted games, platforms, skills and subscription names. Username matches come first. At most 20 (30 when only `platform` is set). Only finished, active, unblocked profiles.
- `games`: only when `q` has at least 2 characters, at most 12 (the same source as `/api/games/search`). `platform` does not filter games.
- `platforms`: the `PLATFORMS` entries that contain `q`, ignoring case (`q=steam` returns `["Steam"]`). Empty without `q`.
- Limit: 60 requests per minute.

**GET /api/players**
- Players who own or want this exact game (ignoring case), online first, at most 50.
- `game` is required: 2 to 80 characters after whitespace is collapsed (`400 game is required`).
- Limit: 60 requests per minute. Invalid requests count too.

### Games

| Method | Path | Query | Response |
| --- | --- | --- | --- |
| GET | `/api/games/search` | `?q=` | `GameSearchResult[]` |
| GET | `/api/games/popular` | | `GameSearchResult[]` |
| GET | `/api/games/details` | `?name=&steamAppId=&rawgId=` | `GameDetails` |

- **Search:** at most 12 results. The curated catalog comes first, then RAWG (when the server has a key) or Steam plus a built-in list. A `q` shorter than 2 or longer than 80 characters returns `[]`. No rate limit.
- **Ids:** `GameSearchResult.id` is a RAWG id, a Steam app id when `source` is `steam`, a negative id for catalog entries, or `0` in some popular entries. Profiles store games by name, so use the name as the key.
- **Popular:** at most 24 titles, each with a cover image. Cached on the server.
- **Details:** `name` is required (2 to 160 characters, `400 name is required`). Pass `steamAppId` or `rawgId` from a `GameTag` when you have them. When nothing is found the answer is still `200`, with `source: "catalog"` and empty fields. Limit: 30 requests per minute.
- Lookups go to RAWG, Steam and Wikipedia and are cached on the server.

### AirShare
Find people who have AirShare open nearby at the same moment.

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/airshare/ping` | `{ lat?, lng?, accuracy?, locating? }` | `AirShareResult` |
| DELETE | `/api/airshare` | no body | `{ ok: true }` |

- **Pinging:** while the AirShare screen is open, ping every few seconds (the web client pings every 2.5 s). Presence expires 45 s after the last ping.
- **Waiting for location:** send `locating: true` while the permission prompt is open or the first fix is pending. You are matched with nobody until then.
- **With location:** send `lat` and `lng` as JSON numbers (`|lat| <= 90`, `|lng| <= 180`) and `accuracy` in meters (`CLLocation.horizontalAccuracy`, Android `Location.getAccuracy()`). Without `accuracy` the server assumes 100 m.
- **Without location:** ping with no coordinates (and no `locating`). You are then matched with people on the same public IP.
- The first fix is snapped to a grid of about 150 m and kept for the whole session. Later coordinates are ignored until you leave or the presence expires.
- **Matching:** when both sides have a precise fix (accuracy up to 1000 m), they must be within `accuracy1 + accuracy2` meters, clamped to 250 to 1000 m. Otherwise the same public IP is enough.
- `profiles`: closest first, then same-network matches, at most 20. Unfinished, inactive and blocked profiles are left out.
- **Leaving:** call `DELETE /api/airshare` when the screen closes or the app goes to the background. Pings in the next 3 s are ignored (they return an empty list), so a late ping in flight cannot bring you back.
- **Limit:** starting at a new place (another grid cell, or a precise fix after a coarse one) is allowed 10 times per 10 minutes (`429`, "Too many AirShare sessions, please try again later"; the web client then waits 30 s). Reopening in the same cell is free.
- Errors: `400 locating must be a boolean`, `400 lat is out of range`, `400 lng is out of range`.

### Stories

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| GET | `/api/stories` | | `Story[]` |
| POST | `/api/stories/:id/view` | no body | `{ ok: true }` |

- Active, published, unexpired stories, at most 20, highest priority first. Users with `ru`, `uk` or `be` get Russian stories, everyone else English, and everyone gets stories without a language.
- `symbol` is a glyph name (for example `shield`, `heart`, `sparkles`). `accentHex` is 6 hex digits without `#`. `ctaUrl` can be a deep link payload such as `s_feed` instead of a web URL. `isSeen` turns true after a view.
- The view call always returns `{ ok: true }`, even for an unknown id.

### Reports, blocks and reviews

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| POST | `/api/reports` | `{ subjectId, reason, details? }` | `{ ok: true }` |
| POST | `/api/blocks` | `{ userId }` | `{ ok: true }` |
| POST | `/api/reviews` | `{ toUid, chatId, rating, text? }` | `{ ok: true }` |

**POST /api/reports**
- `reason` is one of the `REPORT_REASONS` keys: `report.reason.spam`, `report.reason.content`, `report.reason.harassment`, `report.reason.fake`, `report.reason.underage`, `report.reason.other` (otherwise `400 Invalid reason`). `details` is optional free text, trimmed and cut to 1500 UTF-16 code units (a cut can split an emoji). It goes through `String(...)`, so a number or boolean is stored as its text instead of being rejected.
- `400 Invalid profile` for yourself, `404 Profile is unavailable` for an unknown user. Limit: 5 reports per hour.

**POST /api/blocks**
- Safe to repeat. Deletes pending likes in both directions. Shared chats disappear for both users (each gets `chat_removed`) but stay in the database. From then on the two users do not see each other in the feed, search, requests, chats or AirShare.
- There is no unblock endpoint.
- A well-formed UUID of a user that does not exist returns `500`.

**POST /api/reviews**
- `rating` goes through `Number(...)` and must then be an integer from 1 to 5 (`400 Rating must be 1–5`). So the string `"4"` and the boolean `true` (1) are accepted too. Send a JSON number.
- `text` is optional, trimmed, cut to 1000 UTF-16 code units (a cut can split an emoji), and moderated (`content_blocked`). Like `details`, it goes through `String(...)`, so a number or boolean is stored as its text.
- `chatId` must be a chat between you and `toUid` (`404 Chat is unavailable`). There is one review per chat: posting again replaces it. The recipient's `rating` and `reviewCount` update right away.
- The server does not check `canReview`; use `ChatDetails.canReview` to decide when to offer a review. Limit: 10 new reviews per hour. Once it is reached, edits are refused too.

### Config and health

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| GET | `/api/config` | none | `PublicConfig` |
| GET | `/health` | none | `{ ok, telegram, probe?, probeAlternatives? }` |

- `PublicConfig` has `telegramBotUsername`, `telegramAppShortName`, `vkAppId`, `vkGroupId`, `publicUrl`, `supportEmail`, `privacyUrl`, `termsUrl` and `devAuth`. Load it at startup for the legal links, the support address, and whether to offer dev sign-in.
- `/health` is for monitoring. `ok: true` means the database answered (otherwise `500`). `telegram` is `{ mode, configured, route, error, checkedAt }`, or `null` without a bot. `?probe=1` (with optional `&ips=`) makes the server test its connection to the Telegram Bot API; clients should not call it.

Media routes are described in [section 5](#5-uploads-and-media).

### Web client and CORS
Routes that exist only in some setups. Native apps do not call them.

| Method | Path | Auth | Response |
| --- | --- | --- | --- |
| OPTIONS | `/api/*` | none | `204`, no body. Registered only when `CORS_ORIGINS` is set |
| GET | `/*` | none | The web client. Registered only when a web build (`web/dist/index.html`) is found |
| GET | `/` | none | `{ name, hint }`. Registered only when no web build is found |

- **CORS preflight:** every `OPTIONS /api/...` gets `204` with `Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS`, `Access-Control-Allow-Headers: Authorization,Content-Type` and `Access-Control-Max-Age: 86400`. `Access-Control-Allow-Origin` (with `Vary: Origin`) is added, here and on every other response, only when the request's `Origin` is listed in `CORS_ORIGINS`. Without `CORS_ORIGINS` there is no `OPTIONS` route.
- **Web client:** the files of the build are served as they are (`@fastify/static` with `wildcard: false`, so one route per file found at startup). Files under `assets/`, fonts and images get `Cache-Control: public, max-age=31536000, immutable`. Any other `GET` path falls back to `index.html` with `Cache-Control: no-cache`, which covers `/`, `/u/<uid>`, `/?startapp=<payload>` and the other client routes. Unknown `/api/...` and `/media/...` paths get `404 { "error": "Not found" }` instead.
- **Without a web build:** `GET /` returns `{ "name": "UniShare API", "hint": "Build the web client (npm run build --workspace web) to serve the Mini App from this server." }`. Other unknown paths get Fastify's default `404`.

### Webhooks
Server-to-server only: clients never call these.

| Method | Path | Caller | Auth |
| --- | --- | --- | --- |
| POST | `/telegram/webhook` | Telegram Bot API | Header `X-Telegram-Bot-Api-Secret-Token` must equal `TELEGRAM_WEBHOOK_SECRET`, only when that is set. Mounted only when `TELEGRAM_BOT_TOKEN` is set and `TELEGRAM_BOT_MODE=webhook` (the production default) |
| POST | `/vk/callback` | VK Callback API | `secret` must equal `VK_CALLBACK_SECRET` and `group_id` must equal `VK_GROUP_ID`, each when set. Replies in plain text: the confirmation string, `ok`, or `403 forbidden` |

- `TELEGRAM_WEBHOOK_SECRET` is optional, also in production. Without it the Telegram webhook accepts every request. With it, a missing or wrong header gets `401` with the plain body `secret token is wrong`.
- The bot handles `/start` (with a deep link payload), `/feed`, `/chats`, `/profile`, `/nearby`, `/help`, `/privacy` and `/support`, and tracks whether it may message the user.
- The VK callback handles `confirmation`, `message_allow` and `message_deny` (whether the community may message the user).

## 4. Realtime

### Connecting

```text
wss://<host>/api/ws?token=<session token, URL-encoded>
```

- Use `ws://` for a local `http://` server. Only this path accepts upgrades.
- The token goes in the query string only; an `Authorization` header is ignored. A bad, expired or suspended session gets a raw `HTTP/1.1 401 Unauthorized` and the connection closes. Treat it like a `401` from the API.
- The token is checked once, when the socket connects. Logging out does not close it.
- One user can have many sockets (phone, Telegram, web), and each gets every event.
- There is no `Origin` check, so native clients need no extra headers.

### Keep-alive and reconnects
- The server sends a WebSocket ping every 30 s and drops the socket if no pong came back since the previous ping. Common clients (OkHttp, `URLSessionWebSocketTask`) usually answer pings on their own; check yours.
- You can also send `{ "type": "ping" }`. The server replies `{ "type": "pong" }`, which is not part of `RealtimeEvent`, so let your decoder accept it.
- Reconnect with backoff (the web client starts at 0.8 s, doubles up to 30 s, and adds jitter). Missed events are not replayed: after reconnecting, refetch `GET /api/chats`, the open chat's messages and `GET /api/requests`.

### Client to server
`RealtimeCommand`, as JSON text frames of up to 4096 bytes. Send only JSON objects with a `type`. Text that is not valid JSON is ignored, and so are unknown types and JSON values that are not objects (`null`, numbers, strings, arrays). A frame above 4096 bytes closes that socket with code `1009`; reconnect and send smaller frames.

| Command | When to send it |
| --- | --- |
| `{ "type": "visibility", "visible": boolean }` | Right after connecting, then `false` when the app goes to the background and `true` when it comes back |
| `{ "type": "typing", "chatId": string }` | While the user types. The server does not throttle it; the web client sends it at most every 2.5 s. It is relayed only if you are a member of the chat and there is no block |
| `{ "type": "ping" }` | Optional app-level ping |

### Server to client
`RealtimeEvent`, as JSON text frames.

| `type` | Payload | Who gets it | When |
| --- | --- | --- | --- |
| `message` | `{ message: ChatMessage }` | Sender and partner | A new message (idempotent retries send nothing) |
| `chat` | `{ chat: ChatSummary }` | Each member, from their own side | A new message or a new match |
| `chat_removed` | `{ chatId }` | You (hide), or both users (block) | `DELETE /api/chats/:id`, `POST /api/blocks` |
| `read` | `{ chatId, readerId, readAt }` | The partner | `POST /api/chats/:id/read` marked something as read |
| `request` | `{ request: LikeRequestItem }` | The liked user | A like that is not a match |
| `match` | `{ chatId, partner: ProfileCard }` | The user who liked first | A mutual like, by swipe or accept. The user who completes the match gets the HTTP response and a `chat` event instead |
| `typing` | `{ chatId, uid }` | The partner | A `typing` command. There is no "stopped typing" event: hide the indicator after a few seconds (the web client uses 3.5 s) or when a message arrives |
| `presence` | `{ uid, isOnline }` | Nobody | Declared in the type but never sent. Read `isOnline` and `lastSeen` from `ProfileCard` |

### Presence and notifications
- A user is online (`isOnline`) while at least one of their sockets is open. `lastSeen` updates when the first socket opens and when the last one closes.
- Notifications outside the app go through the Telegram bot and the VK community only. Request and message notifications are skipped while the user has a visible socket (one that has not sent `visibility: false`). Match notifications are always sent.
- So a native app should send `visibility: false` (or close the socket) when it goes to the background. The user then still hears about new messages through Telegram or VK.
- There is no APNs or FCM support and no endpoint to register device tokens. Native push needs both, plus a sender next to the bot notifications in `server/src/notify.ts`.
- Socket lists and presence live in the memory of one server process. With several instances, an event would only reach sockets on the instance that published it. The current deployment runs one instance.

## 5. Uploads and media

### Uploading
- Send the raw image bytes as the request body: not multipart, not base64 in JSON.
- `Content-Type` must be `image/jpeg`, `image/png` or `image/webp`, with no parameters. Case and trailing whitespace are ignored (`image/JPEG` works). `image/jpeg; charset=...` and `image/jpg` get `415`.
- An empty body, no body at all, or a body that is not raw bytes (for example JSON or plain text sent to an upload route) is rejected first with `400 { "error": "Send the image as the request body" }` and no `code`.
- The server then detects the real format from the first bytes of the file, and that wins over the header. A body it does not recognize as JPEG, PNG or WebP is `400 unsupported_image`.
- On `POST /api/chats/:id/images`, the membership check (`404 Chat is unavailable`) runs before both checks.
- Compress before uploading. The web client scales images to 800 px (avatars) or 1280 px (chat photos) on the longest side and encodes JPEG at quality 0.85.
- `413` (too large) and `415` (wrong type) are returned before the session is checked.

| Upload | Endpoint | Max size | Returns |
| --- | --- | --- | --- |
| Avatar | `POST /api/me/avatar` | 5 MiB | `{ avatarUrl }`, already saved to the profile |
| Chat photo | `POST /api/chats/:id/images` | 10 MiB | `{ imageUrl }`, to send with `POST /api/chats/:id/messages` |

### Avatars
- Avatars are public. `avatarUrl` is either an absolute bucket URL (S3 storage with `S3_PUBLIC_URL`) or a relative `/media/avatars/<file>` path, served by `GET /media/avatars/:file` without auth.
- A file never changes (a new upload gets a new name) and is served with `Cache-Control: public, max-age=31536000, immutable`, so cache it freely.
- During onboarding, `suggestions.avatarUrl` is the Telegram or VK photo (an https URL). To use it, save it with `PATCH /api/me` and `{ "avatarUrl": ... }`.

### Chat photos
- Chat photos are private. Their URLs look like `/api/media/chats/<chatId>/<file>?exp=<unix seconds>&sig=<signature>`, relative to the base URL.
- `GET /api/media/chats/:chatId/:file` needs no bearer token: the signature is the permission. A bad or expired signature gets `403 { "error": "Link expired" }`, a missing file `404`.
- A link lasts 24 to 25 hours (the expiry is rounded up to the next hour, plus 24 hours). Every messages response signs the links again, so refetch messages for fresh links instead of storing them.
- The path without the query string identifies the image and never changes, so use it as the cache key. Responses carry `Cache-Control: private, max-age=86400`.
- A chat's photos are deleted when both members delete the chat, or when either account is deleted.

### Other images
- Game covers (`GameTag.coverUrl`, `GameSearchResult.backgroundImage`, `GameDetails.image`) are absolute URLs on outside hosts such as RAWG and Steam.

## 6. Rate limits

All limits are per user. A hit returns `429` with `code: "rate_limited"`. There is no `Retry-After` header, so wait out the window (one minute for the per-minute limits).

| Action | Limit | Stored in |
| --- | --- | --- |
| Send a message | 30 per minute, all chats together | Database |
| Like | 40 per minute, counting only like requests that still exist (not likes that made a match or were accepted or declined) | Database |
| Swipe (like or dislike) | 120 per minute, one count per target and kind. Accepting and declining requests count too | Database |
| Report | 5 per hour | Database |
| Review | 10 per hour | Database |
| `GET /api/search` | 60 per minute | Memory |
| `GET /api/players` | 60 per minute | Memory |
| `GET /api/games/details` | 30 per minute | Memory |
| AirShare at a new place | 10 per 10 minutes | Memory |

- Database limits count stored rows, so they hold across server processes and restarts. Memory limits are per server process and reset on restart.
- Not rate limited: sign-in, uploads, blocks, link tokens, `GET /api/games/search`, `GET /api/games/popular`, reads (feed, chats, messages, requests) and WebSocket commands.

### Size limits

| What | Limit |
| --- | --- |
| JSON body | 1 MiB |
| Avatar upload | 5 MiB |
| Chat photo upload | 10 MiB |
| WebSocket frame from the client | 4096 bytes |
| Message text | 1000 UTF-16 code units (rejected when longer) |
| Review text | 1000 UTF-16 code units (cut) |
| Report details | 1500 UTF-16 code units (cut) |
| Username | 3 to 30 characters |
| Status | 180 characters |
| Skills description | 600 characters |
| Game name | 2 to 80 characters |
| Games per platform, wanted games | 30 each |
| Skills | 20, each up to 40 characters |
| Subscriptions | 12 |
| Search `q` | 80 characters (cut) |

### Result sizes

| Endpoint | Most items returned |
| --- | --- |
| `GET /api/feed` | 30 (default 12) |
| `GET /api/chats` | 200 |
| `GET /api/chats/:id/messages` | 100 (default 50) |
| `GET /api/requests` | 100 |
| `GET /api/users/:uid/reviews` | 50 |
| `GET /api/stories` | 20 |
| `GET /api/search` | 20 users (30 with only `platform`), 12 games |
| `GET /api/players` | 50 |
| `GET /api/games/search` | 12 |
| `GET /api/games/popular` | 24 |
| `POST /api/airshare/ping` | 20 |
