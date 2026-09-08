# App Store Connect values

Дата сверки с App Review Guidelines: 10 августа 2026 года.

## Product positioning

- App Store Connect Apple ID: `6800433788`
- Name: `UniShare: Gaming Circle`
- SKU: `UNISHARE-IOS-2026`
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

The app must be described only as teammate discovery, mutual matching, private chat and nearby profile discovery. It does not sell, transfer, lend or exchange gaming accounts, credentials, licenses or payment access.

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

Build `2026090401` replaces the previously reviewed build `2`.

UniShare is a social discovery app for gaming communities. The `Exchange` tab means matching public profiles by games, platforms and gaming memberships; it does not transfer account ownership, credentials, licenses, balances or payment access. UniShare has no marketplace or payment flow. Server-side content rules reject passwords, recovery codes, OTPs, payment details and account-sale messages. The `Skills` tab matches public skill profiles.

Review flow:

1. Sign in with the dedicated review account and open Feed to browse fictional public profiles in `Exchange` and `Skills`.
2. Swipe a profile. A mutual interest creates a private chat; there is no transaction or credential-transfer flow.
3. Open Chats to inspect messages and read receipts. Swipe a chat row left to delete it.
4. Open a profile or chat menu to report or block a user.
5. Open Profile -> Settings -> Delete Account to permanently remove the Auth identity, profile, chats, messages, push token and uploaded files.
6. AirShare opens only from its visible in-app action. It is optional, requires two nearby devices with Bluetooth and Local Network access, exchanges only public UniShare profile data, and has no shake or hidden activation gesture. The core app can be reviewed without AirShare.

The production Supabase backend must remain available during review. App Review credentials must belong to a dedicated non-admin account with a completed fictional profile; production owner or database credentials must never be entered in Review Notes.

## Screenshot rules

- Show the real app in use, not a login screen or title artwork.
- Use only fictional profiles from `make backend-demo` or an equivalent hosted review dataset.
- Capture Home/stories, a player card, Chats, a conversation, Profile and the profile editor.
- Provide current required iPhone and iPad display classes shown by App Store Connect.
- Do not upload simulator images from an unstable runtime or mock functionality that is unavailable in the submitted binary.
