# DataGrip: управление UniShare

DataGrip подключается напрямую к Postgres только как административный инструмент. Эти реквизиты нельзя добавлять в iOS-приложение или отправлять в чат.

## Подключение

1. В Supabase откройте `Connect -> Session pooler`.
2. В DataGrip создайте `PostgreSQL Data Source`.
3. Укажите host, port, database, user и password из Supabase.
4. На вкладке SSL выберите `Require` и выполните `Test Connection`.
5. В SQL Console проверьте `select current_database(), current_user;`.

## Stories

Создать квадратную story, которая появится сразу:

```sql
insert into public.stories (
    title, subtitle, body, image_url, symbol, accent_hex,
    cta_title, cta_url, priority, is_active, published_at, expires_at
) values (
    'Летний турнир',
    'Новые подборки недели',
    'Расскажите пользователям о событии или правилах.',
    null,
    'gamecontroller.fill',
    '0057FF',
    'Открыть главное',
    'unishare://feed',
    100,
    true,
    now(),
    now() + interval '7 days'
)
returning id;
```

Для изображения загрузите квадратный JPG/PNG/WebP в bucket `story-media`, скопируйте Public URL и запишите его в `image_url`. Желательный размер: 1200 x 1200.

Запланировать публикацию можно через будущий `published_at`. Скрытие не удаляет статистику:

```sql
update public.stories
set is_active = false
where id = 'STORY_UUID';
```

Просмотры и охват:

```sql
select
    s.id,
    s.title,
    s.is_active,
    s.published_at,
    count(v.user_id) as unique_views
from public.stories s
left join public.story_views v on v.story_id = s.id
group by s.id
order by s.published_at desc;
```

## Модерация

Очередь жалоб:

```sql
select
    r.id,
    r.created_at,
    r.reason,
    r.details,
    r.state,
    reporter.username as reporter,
    subject.username as reported_user
from public.reports r
join public.users reporter on reporter.uid = r.reporter_id
join public.users subject on subject.uid = r.subject_id
where r.state in ('open', 'reviewing')
order by r.created_at;
```

Взять жалобу в работу и заблокировать аккаунт выполняйте в транзакции:

```sql
begin;

update public.reports
set state = 'reviewing'
where id = 'REPORT_UUID' and state = 'open';

update public.users
set account_state = 'banned', is_online = false
where uid = 'USER_UUID';

commit;
```

Разблокировка:

```sql
update public.users
set account_state = 'active'
where uid = 'USER_UUID';
```

Не удаляйте пользователей вручную из `public.users`: удаление аккаунта нужно проводить через Supabase Authentication, чтобы каскады очистили связанные данные согласованно.

## Каталог игр

Добавить или исправить игру без изменения iOS-клиента:

```sql
insert into public.game_catalog_overrides (
    game_id, name, background_image, rating, released, search_terms, enabled
) values (
    -1001,
    'Название игры',
    'https://example.com/cover.jpg',
    4.5,
    '2026-01-01',
    array['название', 'game alias'],
    true
)
on conflict (game_id) do update set
    name = excluded.name,
    background_image = excluded.background_image,
    rating = excluded.rating,
    released = excluded.released,
    search_terms = excluded.search_terms,
    enabled = excluded.enabled,
    updated_at = now();
```

Для вручную управляемых записей используйте уникальные отрицательные `game_id`. RAWG key не хранится в Postgres и не показывается в DataGrip; он обновляется в Supabase Edge Function Secrets.

## Безопасная работа

- Перед `update` или `delete` выполните тот же фильтр как `select` и проверьте строки.
- Используйте `begin; ... rollback;` для проверки потенциально опасного запроса.
- Не отключайте RLS и не выдавайте `anon`/`authenticated` прямые административные права.
- Не используйте database password, `service_role` или secret key в мобильном клиенте.
- Делайте резервную копию перед массовыми изменениями.
