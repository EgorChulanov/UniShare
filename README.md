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

---

## Setup

### 1. Clone

```bash
git clone https://github.com/egorchulanov/unishare.git
cd unishare
```

### 2. Install XcodeGen & generate project

```bash
brew install xcodegen
xcodegen generate
```

### 3. Configure API Keys

```bash
cp Config/Secrets.xcconfig.template Config/Secrets.xcconfig
```

Edit `Config/Secrets.xcconfig` — **этот файл не попадёт в git**:

```
OPENAI_API_KEY = sk-...your-key...
RAWG_API_KEY = your-rawg-key
```

- **OpenAI key**: https://platform.openai.com/api-keys
- **Rawg key**: https://rawg.io/apidocs (free tier)

### 4. Configure Firebase

1. Create a Firebase project at https://console.firebase.google.com
2. Add an iOS app with bundle ID `com.CHULANOV.UniShare`
3. Download `GoogleService-Info.plist` → place it in `UniShare/` folder
4. Enable **Authentication** (Email/Password), **Firestore**, and **Storage**

> `GoogleService-Info.plist` is gitignored and will never be committed.

### 5. Open in Xcode

```bash
open UniShare.xcodeproj
```

Select your **Development Team** in Signing & Capabilities, then press `Command+R`.

---

## Security — для контрибьюторов

| Файл | Статус |
|---|---|
| `Config/Secrets.xcconfig` | Gitignored — **никогда не коммитить** |
| `GoogleService-Info.plist` | Gitignored — **никогда не коммитить** |
| `Config/Secrets.xcconfig.template` | Коммитится — только с placeholder значениями |

Если случайно закоммитил ключи — немедленно отзови их в соответствующей консоли.

---

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
Never commit secrets — see Security section above.

## License

MIT
