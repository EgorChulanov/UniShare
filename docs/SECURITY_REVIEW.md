# Security Review

Reviewed on 11 August 2026.

No application can be guaranteed to be impossible to compromise. UniShare instead targets least-privilege client access, server-side validation of critical actions, and reproducible abuse tests.

## Implemented Controls

- Removed the AI client, OpenAI key configuration, and `ai_requests` table.
- Revoked direct `create_or_get_chat` access from `authenticated`; chats are created only by a server-side mutual match or acceptance of a real incoming like.
- `accept_like_request` verifies the recipient, enforces blocks, and removes both requests atomically.
- Client-provided `request_id` no longer controls the like primary key.
- Message triggers enforce `sender_id`, `created_at`, and initial `read_by` from `auth.uid()`.
- Message updates may only add the current user to `read_by`; content, image, and sender remain immutable.
- `send_chat_message` writes the message, chat preview, and unread counter in one transaction; direct client insert/update rights are revoked.
- `mark_chat_read` updates read state server-side so clients cannot clear another user's counter.
- AirShare transmits a temporary UID and reloads the profile from Supabase before a like; the peer payload is never trusted as the profile source.
- Images are resized before upload and chat media stays in a private Storage bucket.
- The RAWG key is absent from the iOS binary and is available only to a Supabase Edge Function; results are cached server-side.
- Swipe history persists on the server and survives app restarts.
- DataGrip-managed content rules reject password, recovery-code, OTP, payment-detail, and threat content before UGC is stored.
- Account deletion removes the Auth identity, application rows, and Storage objects through a protected Edge Function.
- APNs tokens are registered only after onboarding through a security-definer RPC, isolated by RLS, and removed on logout and account deletion.
- Legacy URLs, shared-access terms, and family-seat counts are stripped from subscription metadata on every write.
- Account-sale and credential-transfer offers are rejected by server-side content rules.
- Anonymous and PUBLIC execution is revoked from user-facing and `SECURITY DEFINER` functions. Only authenticated RPCs that verify `auth.uid()` are exposed.
- Postgres triggers apply independent rate limits to messages, likes, reports, and reviews.
- Edge Function dependencies are version-pinned and APNs sending never falls back to an obsolete bundle identifier.
- Password policy requires at least 10 characters, uppercase, lowercase, a number, and a special character for new credentials while preserving existing-user sign-in compatibility.
- Profile deletion removes chats that contain the deleted UID before deleting the Auth identity, preventing orphaned participant arrays.

## Verification

`make test-backend` starts an isolated PostgreSQL instance and verifies:

- direct chat creation is denied;
- another user's like cannot be accepted;
- like identifiers are server-generated;
- message sender and content are protected;
- read receipts cannot be forged;
- unread counters update atomically through RPC;
- prohibited message content is rejected before storage;
- feed delivery, persistent dislikes, and time-limited undo work;
- APNs tokens remain isolated and can be safely registered and detached;
- the 31st message within one minute is rejected by the server.

`make test-e2e` runs the equivalent flow through the real Supabase API for three users: registration, profiles, server feed, mutual match, chat and read receipts, report and block, avatar Storage, game catalog, account deletion, and shared-chat cleanup after a participant is deleted.

The full local scenario passed on 11 August 2026. A previous complete run also passed against the hosted project. Hosted chat-cleanup behavior was verified in a transaction that ended with `ROLLBACK`, and no temporary hosted users or objects remained.

The app and widget completed `build-for-testing` and an unsigned Release archive with Xcode 27 Beta. The bundle contains 13 unit tests, including password-policy coverage, and two deterministic UI scenarios. Eleven earlier unit tests completed at runtime. The latest unit/UI runtime attempt is not counted as a pass because the iOS 27 beta Simulator launched without producing an `XCTRunner` process or test events. Repeat runtime validation with stable Xcode or physical devices before release.

Supabase Database Advisors report no missing foreign-key indexes, RLS init-plan issues, or extensions in `public` after the current remediation migrations. Remaining notices relate to intentionally RLS-exposed tables and RPCs, deny-all internal tables, and Auth leaked-password protection configuration.

## Remaining Release Work

- Keep the hosted project synchronized through the latest migration and apply only new migrations afterward.
- Configure production SMTP, email confirmation, and CAPTCHA in Supabase Dashboard.
- Enable leaked-password protection after moving to Supabase Pro.
- Configure backups, Auth/Postgres logs, and alerting for moderation spikes.
- Audit Git history for leaked database passwords, `service_role`, RAWG/OpenAI keys, or an old `Secrets.xcconfig`; rotate anything that may have been exposed.
- Complete an independent penetration test before public release.

## Product Boundary

Steam, Nintendo, and PlayStation restrict account and digital-license transfers. UniShare therefore provides profile discovery, compatibility matching, and communication. It does not handle credentials, payments, account ownership, or transfer execution. Availability in Russia also requires a separate legal review of personal-data localization obligations before distribution is enabled there.
