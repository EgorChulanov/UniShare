# Working prompt for Codex: UniShare

You are working on:
`/Users/egorchulanov/Desktop/UniShare`

Source repository:
`https://github.com/EgorChulanov/UniShare`

Current objective:
`[DESCRIBE THE FEATURE AND EXPECTED RESULT]`

UniShare is a real iOS and iPadOS SwiftUI application backed by Supabase. It supports profile discovery, mutual likes, chats, gaming profiles, stories, and moderation. It is not a UI mockup. Do not replace Supabase with local arrays, sample data, or fake success states.

## Before changing code

1. Read `AGENTS.md`, `README.md`, `docs/SUPABASE_SETUP.md`, `project.yml`, and the relevant Swift and SQL files.
2. Check `git status`. Never remove or revert user changes.
3. Compare disputed behavior with the GitHub repository, but never copy secrets or obsolete Firebase code.
4. Reproduce the problem and identify the exact cause.
5. Write a short plan, then work autonomously until the result is verifiable.

## Architecture

- Use Supabase Auth, Postgres, RLS, RPC, Realtime, and Storage.
- Generate the Xcode project from `project.yml` through XcodeGen. Run `make generate` after adding files.
- Views own presentation, ViewModels own state, Services own I/O, and Codable models define data contracts.
- Split large screens into focused components.
- Use Manrope for body text, Archivo Black only for expressive headings, and Plus Jakarta Sans for accent areas.
- Add every visible string to the English, Russian, Ukrainian, and Belarusian `Localizable.strings` files.
- Preserve readable contrast in light and dark themes.

## Backend requirements

- Every feature must read and persist real Supabase data.
- Use a Postgres RPC or trigger for atomic multi-table changes.
- Every new table needs RLS, grants, indexes, and a migration.
- A publishable key may exist in the client only when RLS is correct.
- Never put database passwords, `service_role`, `sb_secret`, connection strings, or administrator credentials in the iOS app.
- DataGrip is an administrative PostgreSQL client only.
- Administrators create stories in `public.stories`; views belong in `public.story_views`.
- Reports belong in `public.reports`; blocks belong in `public.blocks`.
- Never show success before the server operation completes.

## Authentication and profile

- Verify registration, email confirmation, `unishare://auth-callback`, sign-in, sign-out, and session restoration.
- Create the application profile exactly once after Auth through the onboarding upsert.
- Verify username uniqueness, platforms, games, skills, subscriptions, and avatar upload.
- Preserve subscriptions through every JSON read and edit cycle.

## Critical E2E flow

1. Clean launch and user A registration.
2. Email callback and onboarding for user A.
3. Registration and onboarding for user B.
4. A sees B's real profile and likes it.
5. B sees A and returns the like.
6. The RPC creates exactly one chat.
7. A sends text and an image; B receives both and sees correct unread/read state.
8. A report creates a row in `reports`; a block prevents further interaction.
9. Stories load from the database and a view is recorded in `story_views`.
10. Profile edits survive an app restart.

## UI quality

- Check iPhone and iPad, small and large screens.
- Check light and dark themes, Dynamic Type, keyboard handling, safe areas, and long strings.
- Verify the Home, Chats, and Profile tabs.
- Stories should use compact rectangular cards inspired by banking apps, not circular Instagram avatars.
- Verify `unishare://feed`, `chats`, `profile`, `airshare`, and `auth-callback` deep links.
- Capture key screens and visually inspect contrast, clipping, and overlays.

## Product safety

- Never store or transmit gaming-account passwords through UniShare.
- Before implementing account transfer mechanics, verify the current rules of each gaming platform and the App Store. If transfer is prohibited, use safe teammate discovery, officially supported sharing, or exchange of rights that the platform explicitly permits.
- Moderation must include `account_state`, reports, blocks, and an administrator workflow.

## Verification

- Build for Simulator and a generic unsigned iOS device.
- Run `plutil` for every `Localizable.strings` file.
- Run `supabase db reset` and validate the seed when Docker is available.
- Add regression tests for fixed defects and unit tests for business logic.
- Run `git diff --check` and inspect the final diff.
- Do not hide failures with `try?`, empty catches, force unwraps, or fake success states.
- Never claim a test ran unless the command actually completed.

Do not commit, push, or open a pull request unless the user explicitly asks.

In the final report, list:

- implemented user flows;
- root causes fixed;
- successful builds and tests;
- completed E2E scenarios;
- anything not verified and why;
- primary changed files;
- exact remaining user actions.
