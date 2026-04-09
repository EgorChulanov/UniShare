# UniShare

A modern iOS social app for exchanging gaming accounts, subscriptions, and skills. Built with SwiftUI, Firebase, and a touch of AI.

## Features

- **Exchange Feed** — Swipe-based discovery of profiles for game account exchanges
- **Skills Feed** — Connect with users based on gaming skills
- **AI Assistant** — ChatGPT-powered game recommendations
- **AirShare** — Bluetooth/Multipeer exchange by holding phones together
- **Real-time Chat** — Firebase Firestore messaging with image sharing
- **Widgets** — Home screen and Control Center widgets

## Design

**Liquid Nebula** palette · Dark glassmorphism · Animated gradients

| Color | Hex |
|---|---|
| Primary (coral) | `#E94560` |
| Background (navy) | `#1A1A2E` |
| Tertiary (purple) | `#4A148C` |
| Neutral (dark blue) | `#0F3460` |

## Requirements

- **iOS** 16.1+
- **Xcode** 15.0+
- **Swift** 5.9+
- Homebrew (for XcodeGen)

## Setup

### 1. Clone

```bash
git clone https://github.com/egorchulanov/unishare.git
cd unishare
```

### 2. Bootstrap

```bash
make bootstrap
```

This installs XcodeGen, creates `Config/Secrets.xcconfig` from the template, and generates the Xcode project.

### 3. Configure Firebase

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add an iOS app with bundle ID `com.CHULANOV.UniShare`
3. Download `GoogleService-Info.plist` and place it in `UniShare/`
4. Enable **Authentication** (Email/Password), **Firestore**, and **Storage**

### 4. Configure API Keys

Edit `Config/Secrets.xcconfig`:

```
OPENAI_API_KEY = sk-...your-key...
RAWG_API_KEY = your-rawg-key
```

- **OpenAI key**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Rawg key**: [rawg.io/apidocs](https://rawg.io/apidocs) (free tier available)

### 5. Open & Run

```bash
make open
```

Select your device/simulator and press `Command+R`.

## Architecture

```
UniShare/
├── Core/            # ThemeManager, LocalizationManager, HapticsManager
├── Navigation/      # TabBarView, TabBarState
├── Features/        # Self-contained feature slices
│   ├── Auth/
│   ├── Onboarding/
│   ├── Feed/
│   ├── Chat/
│   ├── AI/
│   ├── AirShare/
│   └── Profile/
├── Models/          # Shared data types
├── Services/        # Firebase, OpenAI, Rawg wrappers
├── Cache/           # Image & data caches
└── Components/      # Reusable SwiftUI views
```

## Firestore Security Rules

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
    match /chats/{chatId} {
      allow read, write: if request.auth.uid in resource.data.participants;
    }
    match /chats/{chatId}/messages/{msgId} {
      allow read, write: if request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.participants;
    }
    match /likeRequests/{reqId} {
      allow read: if request.auth.uid == resource.data.to || request.auth.uid == resource.data.from;
      allow create: if request.auth.uid == request.resource.data.from;
      allow delete: if request.auth.uid == resource.data.to || request.auth.uid == resource.data.from;
    }
  }
}
```

## Contributing

PRs welcome. Please follow existing code style and SwiftUI patterns.

## License

MIT
