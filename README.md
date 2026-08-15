# UniShare

Нативная социальная сеть для поиска тиммейтов по играм, платформам и навыкам. Проект основан на SwiftUI и реальном backend Supabase, а не на локальном mock-слое. UniShare не продаёт, не передаёт и не предоставляет доступ к игровым аккаунтам.

## Что работает

- Email/password регистрация и подтверждение почты через Supabase Auth
- Onboarding и создание реальной анкеты
- Лента анкет с выбором платформ и игр из RAWG
- Атомарные лайки и взаимный мэтч через Postgres RPC
- Realtime-чаты и приватные изображения в Supabase Storage
- Квадратные community stories, управляемые из базы
- Профиль, отзывы, блокировки и жалобы
- AirShare через Multipeer Connectivity
- AirShare и Home Screen widgets
- Русская, английская, украинская и белорусская локализации

## Стек

- iOS 16.1+, SwiftUI, Swift 5.9
- Supabase Auth, Postgres, Realtime, Storage
- XcodeGen и Swift Package Manager
- RAWG для каталога игр
- Manrope, Archivo Black и Plus Jakarta Sans

## Быстрый запуск

```bash
git clone https://github.com/EgorChulanov/UniShare.git
cd UniShare
make bootstrap
```

Заполните локальный `Config/Secrets.xcconfig`:

```xcconfig
SUPABASE_URL = https:/$()/PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY = sb_publishable_YOUR_KEY_HERE
SUPABASE_ANON_KEY = $(SUPABASE_PUBLISHABLE_KEY)
```

Не заменяйте `/$()/` на `//`: в `.xcconfig` двойной слеш начинает комментарий,
и Xcode передаст приложению только `https:`.

Каталожный RAWG key хранится только как Supabase Edge Function secret. После `supabase link` используйте `supabase secrets set RAWG_API_KEY=...`; не добавляйте ключ в Xcode или `Info.plist`.

Схема устанавливается всеми файлами из `supabase/migrations/` по порядку, затем `supabase/seed.sql`. Для локальной базы это делает `make backend-reset`; для hosted-проекта используйте `supabase db push` после проверки `supabase link`.

Полная настройка Supabase, DataGrip, Auth callback и stories описана в [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).
Готовый prompt для следующих задач Codex находится в [`docs/CODEX_PROMPT.md`](docs/CODEX_PROMPT.md).

```bash
make generate
make open
```

Выберите Development Team в Xcode и запустите приложение.

## Архитектура

```text
UniShare/
├── Core/          # окружение, тема, локализация, haptics
├── Features/      # Auth, Onboarding, Feed, Chat, AirShare, Profile
├── Models/        # модели приложения
├── Services/      # Supabase, RAWG, Storage
├── Cache/         # аватары, игры и пользовательские данные
└── Components/    # переиспользуемые SwiftUI-компоненты
supabase/
├── migrations/   # схема, RLS, RPC, Storage policies
└── seed.sql       # стартовые stories
```

## Безопасность

`Config/Secrets.xcconfig` не должен попадать в Git. В iOS допустим только Supabase publishable key; database password, `service_role` и secret keys должны оставаться на сервере.

Проверки: `make test-static`, `make test-backend` и `make test-e2e`.

Hosted-проект `kwonpzkzthprilrhncik` синхронизирован 11 августа 2026 года: RLS/Storage/RPC миграции и Edge Functions `delete-account`, `game-search`, `send-push`, `legal` развёрнуты, local multi-user E2E повторно прошёл, а hosted multi-user E2E проходил ранее. Секреты RAWG/APNs и production SMTP настраиваются отдельно в Supabase Dashboard и не хранятся в репозитории.
