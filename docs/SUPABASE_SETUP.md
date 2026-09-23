# Supabase and DataGrip Setup

UniShare uses Supabase Auth, PostgreSQL, Realtime, and Storage. DataGrip is an administrative SQL client; the mobile app connects only through Supabase APIs.

## 1. Create the Project

1. Create a project in Supabase.
2. Copy the Project URL and publishable key from `Project Settings -> API`.
3. Create the local configuration file:

```bash
cp Config/Secrets.xcconfig.template Config/Secrets.xcconfig
```

4. Fill in the values:

```xcconfig
SUPABASE_URL = https:/$()/PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY = sb_publishable_...
SUPABASE_ANON_KEY = $(SUPABASE_PUBLISHABLE_KEY)
```

The `/$()/` sequence is required in `.xcconfig`. Xcode expands it into `https://` without treating `//` as a comment.

Never add a database password, connection string, `service_role`, or `sb_secret_...` key to the iOS target.

## 2. Database Schema

For a new hosted project, open Supabase SQL Editor and apply:

```text
supabase/migrations/202607150001_initial_schema.sql
```

Then load starter stories:

```text
supabase/seed.sql
```

For installations created before 28 July 2026, apply the remaining migrations in timestamp order. Do not edit a migration that has already been applied. New migrations add persistent swipes, server-side feed ranking, account deletion, content filtering, remote configuration, RAWG caching, administrator views, APNs token registration, abuse rate limits, explicit RPC grants, foreign-key indexes, chat cleanup, and an isolated `citext` extension schema.

The schema includes users, likes, chats, messages, reviews, reports, blocks, stories, push tokens, Storage buckets, RLS, and atomic matching RPCs.

For local development, install Docker Desktop and Supabase CLI, then run:

```bash
make backend-start
make backend-reset
make test-e2e
make test-ui-e2e
```

Create a deterministic local environment with four profiles, two matches, chats, and three stories:

```bash
make backend-demo
```

`make backend-demo` runs `supabase db reset` only against the local project. It never modifies hosted production. Test credentials are printed after a successful seed.

Use `supabase status` to obtain local URLs and the anon key. They may be placed temporarily in `Config/Secrets.xcconfig`; Debug builds permit HTTP only for `127.0.0.1` and `localhost`.

## 3. RAWG and Edge Function Secrets

Never store the RAWG key in Xcode. Open `datagrip/50_game_catalog_admin.sql`, run **CREATE OR ROTATE RAWG KEY**, and enter the value when DataGrip prompts for `RAWG_API_KEY`. The secret is stored in Supabase Vault.

The command below is a fallback for older deployments:

```bash
supabase secrets set RAWG_API_KEY=YOUR_VALUE
supabase functions deploy game-search
supabase functions deploy delete-account
```

Do not place provider keys in `app_config` because clients can read that table through RLS. Maintain game names, artwork, and search aliases without a client release through `public.game_catalog_overrides`; the Edge Function checks overrides and cache before RAWG.

For push notifications, create an APNs key in Apple Developer and store the values as hosted Edge Function secrets:

```bash
supabase secrets set APNS_KEY_ID=YOUR_KEY_ID APNS_TEAM_ID=YOUR_TEAM_ID APNS_TOPIC=YOUR_RELEASE_BUNDLE_ID
supabase secrets set APNS_PRIVATE_KEY="$(cat /secure/path/AuthKey_KEY_ID.p8)"
supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)"
supabase functions deploy send-push --no-verify-jwt
```

Create two `INSERT` Database Webhooks in Supabase Dashboard for `messages` and `like_requests`. Point them to `https://PROJECT_REF.supabase.co/functions/v1/send-push` and set `x-webhook-secret` to the same `WEBHOOK_SECRET`. Never use the database password or `service_role` in a webhook or mobile app.

## 4. Connect DataGrip

1. Open `Connect` in Supabase and select direct PostgreSQL or Session pooler.
2. In DataGrip, choose `New -> Data Source -> PostgreSQL`.
3. Copy the host, port, database, user, and password.
4. Require SSL and append `?sslmode=require` to a JDBC URL when needed.
5. Run `Test Connection`, then open an SQL Console.

Prefer Supabase SQL Editor or CLI for migrations. Use DataGrip for inspection, moderation, stories, and reviewed administrative operations. The workspace lives in `datagrip/`; see [DataGrip Operations](DATAGRIP_OPERATIONS.md).

## 5. Stories

Create a story without artwork:

```sql
insert into public.stories (
  title, subtitle, body, symbol, accent_hex, priority
) values (
  'What is new in UniShare',
  'A short announcement',
  'The complete story content',
  'sparkles',
  'E94560',
  50
);
```

For artwork, upload an image to the public `story-media` bucket and place its public URL in `image_url`.

Archive a story without deleting analytics:

```sql
update public.stories set is_active = false where id = 'STORY_UUID';
```

## 6. Moderation

Inspect open reports:

```sql
select r.*, reporter.username as reporter_name, subject.username as subject_name
from public.reports r
join public.users reporter on reporter.uid = r.reporter_id
join public.users subject on subject.uid = r.subject_id
where r.state in ('open', 'reviewing')
order by r.created_at desc;
```

Ban an account:

```sql
update public.users
set account_state = 'banned', is_online = false
where uid = 'USER_UUID';
```

Restore access:

```sql
update public.users set account_state = 'active' where uid = 'USER_UUID';
```

## 7. Auth and Deep Links

Add this redirect URL in `Authentication -> URL Configuration`:

```text
unishare://auth-callback
```

Enable Email in `Authentication -> Providers`. With Confirm email enabled, a new user receives an email, returns through the callback, and completes onboarding.

Enable CAPTCHA in `Authentication -> Attack Protection` before public release. Leaked-password protection requires Supabase Pro. Until then, new passwords in the app and local Supabase require at least 10 characters, uppercase, lowercase, a number, and a special character. Supabase free SMTP has a low limit and is not suitable for production; configure a dedicated SMTP provider before external TestFlight distribution.

Sign in with Apple requires the Apple capability, a Service ID and key, and the Apple provider configuration in Supabase. Email registration works independently.

## 8. Build

```bash
make generate
open UniShare.xcodeproj
```

Select a Development Team in Xcode. Real recommendations require at least two registered users who have completed onboarding.

## 9. Production Security

- Never commit `Config/Secrets.xcconfig`.
- A publishable key may be embedded in the app because RLS controls access.
- Run administrator operations through Dashboard, DataGrip, or a dedicated backend with `service_role`, never through the client.
- Run `make test-backend` after schema changes.
- Run Supabase Security and Performance Advisors after DDL changes.
