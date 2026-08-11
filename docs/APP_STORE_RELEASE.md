# UniShare App Store and TestFlight release

## Automated path

The manual GitHub workflow `.github/workflows/testflight.yml` imports an Apple Distribution certificate into a temporary keychain, creates an App Store archive with App Store Connect API authentication, then uploads it through `xcodebuild -exportArchive` with `destination=upload`.

Required protected GitHub environment secrets:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `CERTIFICATE_P12_BASE64`
- `CERTIFICATE_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `ASC_KEY_ID`
- `ASC_ISSUER_ID`
- `ASC_KEY_BASE64`
- `APPSTORE_APP_PROFILE_BASE64`
- `APPSTORE_WIDGET_PROFILE_BASE64`

Required protected GitHub environment variables:

- `RELEASE_BUNDLE_ID`
- `RELEASE_WIDGET_BUNDLE_ID` (must equal `<RELEASE_BUNDLE_ID>.Widget`)
- `RELEASE_APP_GROUP_ID`
- `RELEASE_APP_PROFILE`
- `RELEASE_WIDGET_PROFILE`
- `RELEASE_VERSION`
- `RELEASE_BUILD_NUMBER`

## Current verification state

- Hosted Supabase is healthy and synchronized through `20260811160239_move_citext_extension.sql` as of 11 August 2026.
- Production migrations, RLS hardening and four Edge Functions (`delete-account`, `game-search`, `send-push`, `legal`) are deployed.
- Local PostgreSQL security smoke and the current three-user API E2E pass. A previous full hosted run passed, and the account-deletion/chat-cleanup guarantee passed directly on hosted Postgres inside a rolled-back transaction.
- Xcode 27 Beta compiles the application, embedded widget, 13 unit tests and both deterministic UI E2E scenarios in one `build-for-testing`. Eleven pre-existing unit tests previously passed runtime; runtime execution of the current bundle still requires a stable simulator or physical device.
- Apple Developer contains explicit IDs `com.egorchulanov.unishare` and `com.egorchulanov.unishare.Widget`, both associated with `group.com.egorchulanov.unishare`. Local signing uses `UniShare App Store 2026` and `UniShare Widget App Store 2026`. GitHub Actions uses the isolated certificate `49MDWJ329B` with profiles `UniShare App Store CI 2026` and `UniShare Widget App Store CI 2026`.
- App Store Connect app `6800433788` is registered as `UniShare: Gaming Circle`, SKU `UNISHARE-IOS-2026`.
- The signed App Store export from `/tmp/UniShare-Signed-AppStore-20260811-212945.xcarchive` passed local deep signature and entitlement verification. Apple server validation rejected only the missing widget display name and unsupported Xcode 27 beta SDK. The display name is fixed in source; the next upload must be built with stable Xcode 26.6 or newer supported release.
- UI XCTest is not yet a valid runtime pass: on 11 August both the normal runner and an isolated `test-without-building` run reached the booted iOS 27 beta simulator but produced no `XCTRunner` process or test event. The deterministic suite covers registration, onboarding, game selection, profile deletion, a seeded second user, mutual match, chat creation and message delivery; repeat it on a stable Xcode/runtime or a connected physical device before external TestFlight.
- App Store server-side acceptance, runtime UI XCTest and release screenshots remain pending until the stable Xcode toolchain is installed.

## Existing review suspension

The existing App Store Connect record `6753741153`, version `1.0.1 (2)`, is marked `Guideline 5.6 - Developer Code of Conduct - Review Suspended`. Apple explicitly states that replies and resubmissions for that record will not be reviewed. Do not upload another build to that record.

The replacement record is App Store Connect app `6800433788`. All uploads must use `com.egorchulanov.unishare`; never reuse the suspended record or its old bundle identifier.

## Review configuration

- Category: Social Networking
- Age rating: complete the questionnaire conservatively for unrestricted web access, messaging and user-generated content.
- Privacy policy: `https://kwonpzkzthprilrhncik.supabase.co/functions/v1/legal/privacy`
- Support URL: `https://kwonpzkzthprilrhncik.supabase.co/functions/v1/legal/support`
- Encryption declaration: only Apple platform cryptography and HTTPS are used; `ITSAppUsesNonExemptEncryption` is `false`.
- Review notes must explain AirShare Bluetooth use, teammate discovery, the mutual-like flow, reporting/blocking, content filtering and account deletion. State clearly that UniShare does not support sales, transfers or credential sharing for gaming accounts.
- Enable Push Notifications for the App ID before the first signed archive; APNs tokens are registered only for authenticated profiles and removed on logout/deletion.
- Provide a dedicated least-privilege review account with a completed profile and a second seeded profile. Never place a production administrator credential in Review Notes.

## Required screenshots

Because the target supports iPhone and iPad, capture both current required display classes from a deterministic hosted demo dataset:

- 6.9-inch iPhone portrait: feed with square stories, profile card, chats, profile editor.
- 13-inch iPad portrait: feed, chats and profile.

Do not upload mockups that show unavailable functionality. Screenshots must come from the archived build or the same release configuration.

`make backend-demo` создаёт детерминированный локальный набор анкет, матчей, сообщений и stories для screenshot-сессии. На текущем Mac iOS 27 beta CoreSimulator загружается, но зависает на `simctl launch`/Accessibility services; снимки необходимо повторить на stable runtime или подключённом устройстве, а не заменять макетами.

## Russia distribution decision

The current hosted database endpoint is in AWS `us-east-1`. Russian Federal Law 152-FZ, Article 18(5), generally requires collection and primary storage operations for Russian citizens' personal data to use databases in Russia, subject to statutory exceptions. Before selecting Russia in App Store availability, obtain legal review and move the primary personal-data backend to Russian infrastructure or document a valid exception. App Store availability and technical reachability alone do not establish legal compliance.
