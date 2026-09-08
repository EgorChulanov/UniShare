# Supabase и DataGrip

UniShare использует Supabase Auth, Postgres, Realtime и Storage. DataGrip нужен как административный SQL-клиент; мобильное приложение подключается только через Supabase API.

## 1. Создание проекта

1. Создайте проект в Supabase.
2. В `Project Settings -> API` скопируйте Project URL и publishable key (`sb_publishable_...`).
3. Создайте локальный файл конфигурации:

```bash
cp Config/Secrets.xcconfig.template Config/Secrets.xcconfig
```

4. Заполните значения:

```xcconfig
SUPABASE_URL = https:/$()/PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY = sb_publishable_...
SUPABASE_ANON_KEY = $(SUPABASE_PUBLISHABLE_KEY)
```

Конструкция `/$()/` обязательна для `.xcconfig`: после раскрытия Xcode получает
обычный `https://`, но не обрезает строку как комментарий.

В iOS нельзя добавлять database password, connection string, `service_role` или `sb_secret_...`.

## 2. Схема базы

Откройте Supabase `SQL Editor`, вставьте и выполните:

```text
supabase/migrations/202607150001_initial_schema.sql
```

Затем добавьте стартовые stories:

```text
supabase/seed.sql
```

Если базовая схема уже была установлена до 28 июля 2026 года, выполните в SQL Editor только:

```text
supabase/migrations/202607280001_security_hardening.sql
supabase/migrations/202607280002_avatar_storage_policies.sql
supabase/migrations/202608050001_production_readiness.sql
supabase/migrations/202608050002_push_token_registration.sql
supabase/migrations/202608050003_app_store_compliance.sql
supabase/migrations/202608050004_abuse_rate_limits.sql
supabase/migrations/20260810113932_rpc_execution_hardening.sql
supabase/migrations/20260810114356_database_advisor_remediation.sql
supabase/migrations/20260810160000_account_deletion_chat_cleanup.sql
supabase/migrations/20260811160239_move_citext_extension.sql
```

Последние миграции добавляют постоянные свайпы и серверную ленту, удаление аккаунта, content filtering, remote config, RAWG cache, административные read-only views, безопасную регистрацию APNs tokens, удаление legacy-метаданных передачи доступа, abuse rate limits, явные RPC grants, недостающие FK-индексы, очистку чатов при удалении любого участника и перенос `citext` из `public` в служебную схему `extensions`.

Миграция создаёт пользователей, лайки, чаты, сообщения, отзывы, жалобы, блокировки, stories, push-токены, Storage buckets, RLS и RPC для атомарного мэтча.

Для локальной разработки установите Docker Desktop и Supabase CLI, затем выполните:

```bash
make backend-start
make backend-reset
make test-e2e
make test-ui-e2e
```

Для визуальной проверки и скриншотов можно одной командой полностью пересоздать локальный стенд с четырьмя анкетами, двумя матчами, чатами и тремя stories:

```bash
make backend-demo
```

Команда намеренно выполняет `supabase db reset` только для локального проекта. Production Supabase она не изменяет. Тестовый вход выводится в терминал после успешного seed.

Команда `supabase status` покажет локальные Project URL и anon key. Их можно временно записать в `Config/Secrets.xcconfig`: Debug-сборка разрешает HTTP только для `127.0.0.1` и `localhost`.

RAWG key не записывается в Xcode. После `supabase link` настройте hosted secret:

```bash
supabase secrets set RAWG_API_KEY=YOUR_VALUE
supabase functions deploy game-search
supabase functions deploy delete-account
```

Ключ провайдера нельзя хранить в `app_config`: эта таблица читается клиентом через RLS. Обновляйте секрет через Dashboard `Edge Functions -> Secrets` или команду выше. Названия, изображения и поисковые синонимы игр можно менять онлайн без ключа в `public.game_catalog_overrides`; функция сначала использует эту таблицу и кэш, а затем RAWG.

Для push-уведомлений создайте APNs key в Apple Developer и добавьте значения только как hosted Edge Function secrets:

```bash
supabase secrets set APNS_KEY_ID=YOUR_KEY_ID APNS_TEAM_ID=YOUR_TEAM_ID APNS_TOPIC=YOUR_NEW_RELEASE_BUNDLE_ID
supabase secrets set APNS_PRIVATE_KEY="$(cat /secure/path/AuthKey_KEY_ID.p8)"
supabase secrets set WEBHOOK_SECRET="$(openssl rand -hex 32)"
supabase functions deploy send-push --no-verify-jwt
```

В Supabase Dashboard создайте два Database Webhook для `INSERT`: таблицы `messages` и `like_requests`. URL указывает на `https://PROJECT_REF.supabase.co/functions/v1/send-push`; заголовок `x-webhook-secret` должен совпадать с `WEBHOOK_SECRET`. Не используйте в webhook или приложении database password и `service_role`.

## 3. Подключение DataGrip

1. В Supabase откройте `Connect` и выберите прямое подключение Postgres или Session pooler.
2. В DataGrip: `New -> Data Source -> PostgreSQL`.
3. Перенесите host, port, database, user и password из панели `Connect`.
4. Включите SSL. Для URL JDBC добавьте `?sslmode=require`.
5. Нажмите `Test Connection`, затем откройте SQL Console.

Для миграций предпочтительнее SQL Editor или Supabase CLI. DataGrip удобно использовать для просмотра таблиц, moderation и управления stories. Локальный DataGrip workspace находится в `datagrip/`, расширенные запросы описаны в `docs/DATAGRIP_OPERATIONS.md`.

## 4. Stories

Добавление истории без картинки:

```sql
insert into public.stories (
  title, subtitle, body, symbol, accent_hex, priority
) values (
  'Новое в UniShare',
  'Короткий анонс',
  'Полный текст истории',
  'sparkles',
  'E94560',
  50
);
```

Для истории с картинкой сначала загрузите файл в публичный bucket `story-media` через Supabase Dashboard, затем укажите public URL в `image_url`.

Скрыть историю:

```sql
update public.stories set is_active = false where id = 'STORY_UUID';
```

## 5. Moderation через DataGrip

Открытые жалобы:

```sql
select r.*, reporter.username as reporter_name, subject.username as subject_name
from public.reports r
join public.users reporter on reporter.uid = r.reporter_id
join public.users subject on subject.uid = r.subject_id
where r.state in ('open', 'reviewing')
order by r.created_at desc;
```

Заблокировать аккаунт администратором:

```sql
update public.users
set account_state = 'banned', is_online = false
where uid = 'USER_UUID';
```

Вернуть доступ:

```sql
update public.users set account_state = 'active' where uid = 'USER_UUID';
```

## 6. Auth и deep links

В `Authentication -> URL Configuration` добавьте redirect URL:

```text
unishare://auth-callback
```

В `Authentication -> Providers` включите Email. При включённом Confirm email новый пользователь получает письмо, возвращается в приложение по callback и затем заполняет профиль.

В `Authentication -> Attack Protection` включите CAPTCHA перед публичным запуском. Leaked-password protection доступна только на Pro Plan; после перехода включите её там же. До этого новые пароли в приложении и локальном Supabase требуют 10+ символов, верхний/нижний регистр, цифру и специальный знак. Free SMTP имеет низкий лимит писем и не подходит для production; подключите собственный SMTP provider до внешнего TestFlight.

Для Sign in with Apple потребуются Apple Developer capability, Service ID/Key и настройка Apple provider в Supabase. Email-регистрация уже работает независимо от Apple.

## 7. Сборка

```bash
make generate
open UniShare.xcodeproj
```

В Xcode выберите Development Team. Реальные анкеты появятся после регистрации минимум двух пользователей и завершения onboarding у обоих.

## 8. Production security

- Никогда не коммитьте `Config/Secrets.xcconfig`.
- Publishable key разрешено помещать в приложение: доступ ограничивает RLS.
- Административные операции выполняйте через Dashboard/DataGrip или отдельный backend с `service_role`, но не из клиентского приложения.
- После изменения схемы запускайте `make test-backend`.
- После DDL запускайте Supabase Security и Performance Advisors. Предупреждение о `public.citext` оставлено намеренно: перенос extension ломает generated casts PostgREST 14 при создании профиля.
