# App Review Guideline 5.6 remediation

## Rejection

App Store Connect app `6800433788`, submission `0ae987ce-9fcb-4c14-8ab5-8ce4362cd483`, was rejected on 19 August 2026 under Guideline 5.6 because Apple identified behavior commonly associated with fraudulent activity and features that appeared intentionally hidden during review.

## Root causes found in build 1

- A global accelerometer listener opened AirShare when the device was shaken from any main screen. This entry path was not visible in normal navigation.
- The production target contained environment-driven UI-testing behavior that skipped the greeting and allowed backend endpoint overrides. It was intended for XCTest screenshots but should never have existed in a Release binary.
- The client and database still used the legacy internal type `exchange` even though the visible product had been changed to teammate discovery.
- The repository documentation incorrectly treated a new App Store Connect record as a replacement for a previously suspended record. Further replacement records must not be created.

## Build 2 remediation

- AirShare is accessible only from the visible **AirShare nearby** button on Home or its documented deep link. Global shake activation and the Motion permission were removed.
- UI-test and Supabase environment overrides compile only in `DEBUG`; Release always uses signed bundle configuration and the normal onboarding flow.
- The client and stored discovery contract now use `teammates`. A server-only legacy alias safely normalizes requests from build 1 and never stores the old value.
- Settings now contains **How UniShare Works**, which lists every user-facing feature, its access path and the safety boundaries.
- UniShare remains a teammate-discovery and messaging service. It does not sell, transfer, lend or share gaming accounts, subscriptions, credentials, licenses or payment access. Server moderation rejects credential and account-sale messages.

## Complete review paths

1. Sign in with the dedicated non-admin review account.
2. Home shows square community stories, the visible Teammates/Skills selector and swipeable player profiles.
3. Tap **AirShare nearby** on Home to open nearby profile discovery. A second physical device is optional; no hidden gesture exists.
4. Chats shows all mutual matches. Open a chat to send text or an image and to access block, report and teammate rating controls.
5. Profile allows editing the public gaming profile. Profile > Settings > How UniShare Works lists all features.
6. Profile > Settings > Delete Account permanently deletes the authentication identity and associated application data.

## App Review reply draft

Hello App Review,

Thank you for identifying the Guideline 5.6 concern. We audited both the current app and its earlier prototype history. The earlier prototype was described as an account-exchange concept, but the submitted product is a teammate-discovery service and does not support account sales, transfers, subscription sharing, credential exchange, payments, or brokerage.

We found and removed behavior that could reasonably appear hidden in build 1: a global shake gesture could open the nearby-profile AirShare screen, and XCTest environment switches were present in the production target. In build 2, AirShare can only be opened from the visible “AirShare nearby” button on Home, the global gesture and Motion permission are removed, and all test/backend overrides compile only in Debug. We also replaced the legacy client/data label “exchange” with “teammates” and added Profile > Settings > How UniShare Works, which openly lists every feature and access path.

All functionality is available to the supplied review account with no special account role, date, region, remote flag, secret gesture, or review-specific backend response. The complete paths are: Home for Teammates/Skills profiles and stories; Home > AirShare nearby for Bluetooth discovery; Chats for matches, messages, block and report; Profile for profile editing; Profile > Settings for feature disclosure, policies, support and permanent account deletion.

Server-side moderation rejects passwords, OTP/recovery codes, payment details and account-sale messages. We have not created and will not create another App Store record to bypass this review. Please review build 2. If Apple is referring to another specific behavior or association, please identify it so we can address it directly and transparently.

Thank you.
