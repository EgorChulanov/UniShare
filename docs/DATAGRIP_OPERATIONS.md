# DataGrip Operations for UniShare

DataGrip connects directly to Postgres as an administrative tool. Never place these credentials in the iOS app or share them in messages.

## Connection

1. Open `Connect -> Session pooler` in Supabase.
2. Create a PostgreSQL data source in DataGrip.
3. Copy the host, port, database, user, and password from Supabase.
4. Set SSL mode to `Require` and run `Test Connection`.
5. In the SQL Console, verify `select current_database(), current_user;`.

Use the local data source for development whenever possible. Reserve the production connection for deliberate read-only inspection and reviewed administrative operations.

## Stories

Create a square story that becomes visible immediately:

```sql
insert into public.stories (
    title, subtitle, body, image_url, symbol, accent_hex,
    cta_title, cta_url, priority, is_active, published_at, expires_at
) values (
    'Summer Tournament',
    'New picks this week',
    'Tell the community about an event, update, or safety rule.',
    null,
    'gamecontroller.fill',
    '0057FF',
    'Open Feed',
    'unishare://feed',
    100,
    true,
    now(),
    now() + interval '7 days'
)
returning id;
```

For artwork, upload a square JPG, PNG, or WebP file to the public `story-media` bucket, copy its public URL, and place it in `image_url`. The recommended size is 1200 x 1200.

Schedule publication with a future `published_at`. Archiving keeps analytics intact:

```sql
update public.stories
set is_active = false
where id = 'STORY_UUID';
```

Story reach:

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

## Moderation

Open report queue:

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

Take a report and ban an account in one transaction:

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

Restore access:

```sql
update public.users
set account_state = 'active'
where uid = 'USER_UUID';
```

Do not delete users manually from `public.users`. Account deletion must run through Supabase Authentication so database and Storage cleanup remain consistent.

## Game Catalog

Add or correct a game without shipping a new iOS build:

```sql
insert into public.game_catalog_overrides (
    game_id, name, background_image, rating, released, search_terms, enabled
) values (
    -1001,
    'Game Title',
    'https://example.com/cover.jpg',
    4.5,
    '2026-01-01',
    array['game title', 'game alias'],
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

Use unique negative `game_id` values for manually maintained entries.

The RAWG key is encrypted in Supabase Vault and rotated from `datagrip/50_game_catalog_admin.sql`. Run only the **CREATE OR ROTATE RAWG KEY** block. DataGrip prompts for `RAWG_API_KEY`, then the safe status query should report `configured = true`. Never select the secret value or save it in an SQL file. Mobile `anon` and `authenticated` roles cannot execute the server-only RPC that reads it.

## Safe Administration

- Run the same filter as a `select` before any `update` or `delete`.
- Use `begin; ... rollback;` to validate potentially destructive queries.
- Never disable RLS or grant direct administrative rights to `anon` or `authenticated`.
- Never put database passwords, `service_role`, or secret keys in the mobile client.
- Back up production data before bulk operations.
