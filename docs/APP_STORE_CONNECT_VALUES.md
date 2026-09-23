# App Store Connect values

Last reviewed against the App Review Guidelines on 10 August 2026.

## Product positioning

- App Store Connect Apple ID: `6809169146`
- Name: `UniShare: Games Sharing`
- Bundle ID: `com.egorchulanov.unishare.gamesharing`
- Primary category: `Social Networking`
- English subtitle: `Find your gaming circle`
- Russian subtitle: `Твоё игровое сообщество`
- Support URL: `https://kwonpzkzthprilrhncik.supabase.co/functions/v1/legal/support`
- Privacy policy URL: `https://kwonpzkzthprilrhncik.supabase.co/functions/v1/legal/privacy`
- Contact email: `official@egorchulanov.ru`
- Copyright: `2026 Egor Chulanov`
- Price: Free
- In-app purchases: None
- Non-exempt encryption: No. The app uses Apple system cryptography and TLS only.

The app helps users discover compatible gaming profiles and libraries across major platforms, match through mutual interest, and discuss possible exchanges in private chat. It does not collect credentials, process payments, broker transactions, or transfer an account on a user's behalf.

## App Privacy answers

Tracking: `No`.

Data linked to the user, not used for tracking, purpose `App Functionality`:

- Contact Info -> Email Address
- Identifiers -> User ID
- Identifiers -> Device ID (APNs device token)
- User Content -> Photos or Videos
- User Content -> Other User Content (profile, messages, reports)
- Usage Data -> Product Interaction (swipes, likes, matches and story views)

The app does not collect precise/coarse location, contacts, financial information, health data, browsing history, advertising data or cross-app tracking identifiers. Game-search text is used to return results and is not retained as a per-user search history.

## Age rating questionnaire

- User-generated content: Yes
- Messaging and chat: Yes
- Unrestricted web access: No
- Location sharing: No
- Gambling, contests, loot boxes or real-money gaming: No
- Sexual, violent, medical, alcohol, tobacco or drug content supplied by the app: None
- Parental controls or Kids Category: No

Accept the rating calculated by App Store Connect; do not manually lower it.

## Review notes

UniShare is a social discovery app for finding compatible gaming profiles and discussing account or library exchanges. It does not request or store passwords, recovery codes, OTPs, payment details, or other credentials, and it never executes transfers or transactions. Server-side content rules reject credential and payment-detail requests.

Review flow:

1. Sign in with the dedicated review account and open Home to browse fictional player profiles.
2. Swipe or use the action buttons. A mutual interest creates a private chat.
3. Open Chats to inspect messages and read receipts.
4. Open a profile or chat menu to report or block a user.
5. Open Profile -> Settings -> Delete Account to permanently remove the Auth identity, profile, chats, messages, push token and uploaded files.
6. AirShare is optional and requires two nearby devices with Bluetooth and Local Network access. The core app can be reviewed without AirShare.
7. Profile -> Settings -> How UniShare Works lists every feature and its visible navigation path. There are no hidden gestures, review-specific accounts, regions, dates or remote feature flags.

The production Supabase backend must remain available during review. App Review credentials must belong to a dedicated non-admin account with a completed fictional profile; production owner or database credentials must never be entered in Review Notes.

## Screenshot rules

- Show the real app in use, not a login screen or title artwork.
- Use only fictional profiles from `make backend-demo` or an equivalent hosted review dataset.
- Capture Home/stories, a player card, Chats, a conversation, Profile and the profile editor.
- Provide current required iPhone and iPad display classes shown by App Store Connect.
- Do not upload simulator images from an unstable runtime or mock functionality that is unavailable in the submitted binary.
