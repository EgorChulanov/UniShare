-- UniShare destructive remote reset.
-- Run manually in Supabase SQL Editor only after confirming legacy public data can be deleted.
-- Auth identities and uploaded Storage objects are preserved.

begin;

drop policy if exists avatar_metadata_read on storage.objects;
drop policy if exists avatar_upload_self on storage.objects;
drop policy if exists avatar_update_self on storage.objects;
drop policy if exists avatar_delete_self on storage.objects;
drop policy if exists chat_media_read_members on storage.objects;
drop policy if exists chat_media_upload_members on storage.objects;
drop policy if exists chat_media_delete_members on storage.objects;

drop table if exists public.device_tokens cascade;
drop table if exists public.reports cascade;
drop table if exists public.blocks cascade;
drop table if exists public.story_views cascade;
drop table if exists public.stories cascade;
drop table if exists public.reviews cascade;
drop table if exists public.ai_requests cascade;
drop table if exists public.messages cascade;
drop table if exists public.chats cascade;
drop table if exists public.like_requests cascade;
drop table if exists public.users cascade;

drop type if exists public.report_state cascade;
drop type if exists public.account_state cascade;

create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.account_state as enum ('active', 'suspended', 'banned');
create type public.report_state as enum ('open', 'reviewing', 'resolved', 'rejected');

create table public.users (
    uid uuid primary key references auth.users(id) on delete cascade,
    username citext not null unique check (char_length(username) between 3 and 30),
    avatar_url text,
    status text check (char_length(status) <= 180),
    games text[] not null default '{}',
    wanted_games text[] not null default '{}',
    platforms text[] not null default '{}',
    platform_games jsonb not null default '{}'::jsonb check (jsonb_typeof(platform_games) = 'object'),
    skills text[] not null default '{}',
    skills_description text check (char_length(skills_description) <= 600),
    has_skills_profile boolean not null default false,
    subscriptions jsonb not null default '[]'::jsonb check (jsonb_typeof(subscriptions) = 'array'),
    onboarding_complete boolean not null default false,
    is_online boolean not null default false,
    last_seen timestamptz,
    rating double precision not null default 0 check (rating between 0 and 5),
    review_count integer not null default 0 check (review_count >= 0),
    account_state public.account_state not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (platforms <@ array['Nintendo', 'PlayStation', 'Xbox', 'PC', 'Mobile']::text[])
);

create index users_feed_idx on public.users (onboarding_complete, account_state, created_at desc);
create index users_skills_idx on public.users (has_skills_profile) where has_skills_profile;
create index users_games_gin_idx on public.users using gin (games);
create index users_platforms_gin_idx on public.users using gin (platforms);

create table public.like_requests (
    id text primary key,
    from_uid uuid not null references public.users(uid) on delete cascade,
    to_uid uuid not null references public.users(uid) on delete cascade,
    request_type text not null check (request_type in ('exchange', 'skills')),
    created_at timestamptz not null default now(),
    check (from_uid <> to_uid),
    unique (from_uid, to_uid, request_type)
);

create index like_requests_inbox_idx on public.like_requests (to_uid, request_type, created_at desc);

create table public.chats (
    id uuid primary key default gen_random_uuid(),
    participants uuid[] not null check (cardinality(participants) = 2 and participants[1] <> participants[2]),
    participant_low uuid generated always as (least(participants[1], participants[2])) stored,
    participant_high uuid generated always as (greatest(participants[1], participants[2])) stored,
    last_message text not null default '' check (char_length(last_message) <= 1000),
    last_message_at timestamptz not null default now(),
    chat_type text not null check (chat_type in ('exchange', 'skills')),
    unread_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(unread_counts) = 'object'),
    created_at timestamptz not null default now(),
    unique (participant_low, participant_high, chat_type)
);

create index chats_participants_gin_idx on public.chats using gin (participants);
create index chats_last_message_idx on public.chats (last_message_at desc);

create table public.messages (
    id text primary key,
    chat_id uuid not null references public.chats(id) on delete cascade,
    sender_id uuid not null references public.users(uid) on delete cascade,
    text text check (char_length(text) between 1 and 1000),
    image_url text,
    created_at timestamptz not null default now(),
    read_by uuid[] not null default '{}',
    check (text is not null or image_url is not null)
);

create index messages_chat_created_idx on public.messages (chat_id, created_at);

create table public.reviews (
    id text primary key,
    from_uid uuid not null references public.users(uid) on delete cascade,
    to_uid uuid not null references public.users(uid) on delete cascade,
    chat_id uuid references public.chats(id) on delete set null,
    rating integer not null check (rating between 1 and 5),
    review_text text check (char_length(review_text) <= 1000),
    created_at timestamptz not null default now(),
    check (from_uid <> to_uid),
    unique (from_uid, to_uid, chat_id)
);

create index reviews_target_idx on public.reviews (to_uid, created_at desc);

create table public.stories (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 64),
    subtitle text not null default '' check (char_length(subtitle) <= 120),
    body text not null default '' check (char_length(body) <= 3000),
    image_url text,
    symbol text not null default 'sparkles',
    accent_hex char(6) not null default 'E94560' check (accent_hex ~ '^[0-9A-Fa-f]{6}$'),
    cta_title text check (char_length(cta_title) <= 40),
    cta_url text,
    priority integer not null default 0,
    is_active boolean not null default true,
    published_at timestamptz not null default now(),
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    check (expires_at is null or expires_at > published_at)
);

create index stories_published_idx on public.stories (is_active, priority desc, published_at desc);

create table public.story_views (
    story_id uuid not null references public.stories(id) on delete cascade,
    user_id uuid not null references public.users(uid) on delete cascade,
    viewed_at timestamptz not null default now(),
    primary key (story_id, user_id)
);

create table public.blocks (
    blocker_id uuid not null references public.users(uid) on delete cascade,
    blocked_id uuid not null references public.users(uid) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    check (blocker_id <> blocked_id)
);

create table public.reports (
    id uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references public.users(uid) on delete cascade,
    subject_id uuid not null references public.users(uid) on delete cascade,
    reason text not null check (char_length(reason) between 3 and 80),
    details text not null default '' check (char_length(details) <= 1500),
    state public.report_state not null default 'open',
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    check (reporter_id <> subject_id)
);

create table public.device_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(uid) on delete cascade,
    token text not null unique,
    environment text not null check (environment in ('sandbox', 'production')),
    updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger users_touch_updated_at
before update on public.users
for each row execute function public.touch_updated_at();

create or replace function public.is_blocked_pair(target_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.blocks
        where (blocker_id = auth.uid() and blocked_id = target_uid)
           or (blocker_id = target_uid and blocked_id = auth.uid())
    );
$$;

create or replace function public.is_chat_member(target_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.chats
        where id = target_chat_id
          and auth.uid() = any(participants)
          and not exists (
              select 1 from public.blocks
              where blocker_id = any(participants)
                and blocked_id = any(participants)
          )
    );
$$;

create or replace function public.can_review(target_uid uuid, target_chat_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.chats
        where id = target_chat_id
          and auth.uid() = any(participants)
          and target_uid = any(participants)
          and target_uid <> auth.uid()
          and not public.is_blocked_pair(target_uid)
    );
$$;

revoke all on function public.is_blocked_pair(uuid) from public;
revoke all on function public.is_chat_member(uuid) from public;
revoke all on function public.can_review(uuid, uuid) from public;
grant execute on function public.is_blocked_pair(uuid) to authenticated;
grant execute on function public.is_chat_member(uuid) to authenticated;
grant execute on function public.can_review(uuid, uuid) to authenticated;

create or replace function public.protect_user_managed_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if current_user = 'authenticated' then
        new.uid := old.uid;
        new.rating := old.rating;
        new.review_count := old.review_count;
        new.account_state := old.account_state;
        new.created_at := old.created_at;
    end if;
    return new;
end;
$$;

create trigger users_protect_managed_columns
before update on public.users
for each row execute function public.protect_user_managed_columns();

create or replace function public.protect_chat_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if current_user = 'authenticated' then
        new.participants := old.participants;
        new.chat_type := old.chat_type;
        new.created_at := old.created_at;
    end if;
    return new;
end;
$$;

create trigger chats_protect_identity
before update on public.chats
for each row execute function public.protect_chat_identity();

create or replace function public.protect_message_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if current_user = 'authenticated' then
        new.id := old.id;
        new.chat_id := old.chat_id;
        new.sender_id := old.sender_id;
        new.text := old.text;
        new.image_url := old.image_url;
        new.created_at := old.created_at;
        new.read_by := array(
            select distinct value
            from unnest(old.read_by || auth.uid()) as value
        );
    end if;
    return new;
end;
$$;

create trigger messages_protect_content
before update on public.messages
for each row execute function public.protect_message_content();

create or replace function public.protect_new_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if current_user = 'authenticated' then
        new.sender_id := auth.uid();
        new.created_at := now();
        new.read_by := array[auth.uid()];
    end if;
    return new;
end;
$$;

create trigger messages_protect_insert
before insert on public.messages
for each row execute function public.protect_new_message();

create or replace function public.create_or_get_chat(other_uid uuid, kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    result_id uuid;
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if other_uid is null or caller = other_uid then raise exception 'Invalid participant'; end if;
    if kind not in ('exchange', 'skills') then raise exception 'Invalid chat type'; end if;
    if not exists (select 1 from public.users where uid = other_uid and account_state = 'active') then
        raise exception 'Profile is unavailable';
    end if;
    if public.is_blocked_pair(other_uid) then raise exception 'Profile is unavailable'; end if;

    insert into public.chats (participants, chat_type, unread_counts)
    values (
        array[caller, other_uid],
        kind,
        jsonb_build_object(caller::text, 0, other_uid::text, 0)
    )
    on conflict (participant_low, participant_high, chat_type) do nothing
    returning id into result_id;

    if result_id is null then
        select id into result_id
        from public.chats
        where participant_low = least(caller, other_uid)
          and participant_high = greatest(caller, other_uid)
          and chat_type = kind;
    end if;
    return result_id;
end;
$$;

create or replace function public.send_like(target_uid uuid, kind text, request_id text)
returns table (matched boolean, chat_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    reverse_exists boolean;
    result_chat_id uuid;
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if target_uid is null or caller = target_uid then raise exception 'Invalid profile'; end if;
    if kind not in ('exchange', 'skills') then raise exception 'Invalid request type'; end if;
    if not exists (select 1 from public.users where uid = target_uid and onboarding_complete and account_state = 'active') then
        raise exception 'Profile is unavailable';
    end if;
    if public.is_blocked_pair(target_uid) then raise exception 'Profile is unavailable'; end if;

    insert into public.like_requests (id, from_uid, to_uid, request_type)
    values (caller::text || '_' || target_uid::text || '_' || kind, caller, target_uid, kind)
    on conflict (from_uid, to_uid, request_type)
    do update set created_at = now();

    select exists (
        select 1 from public.like_requests
        where from_uid = target_uid and to_uid = caller and request_type = kind
    ) into reverse_exists;

    if reverse_exists then
        result_chat_id := public.create_or_get_chat(target_uid, kind);
        delete from public.like_requests
        where request_type = kind
          and ((from_uid = caller and to_uid = target_uid) or (from_uid = target_uid and to_uid = caller));
        return query select true, result_chat_id;
    else
        return query select false, null::uuid;
    end if;
end;
$$;

create or replace function public.accept_like_request(request_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    sender uuid;
    kind text;
    result_chat_id uuid;
begin
    if caller is null then raise exception 'Authentication required'; end if;

    select from_uid, request_type into sender, kind
    from public.like_requests
    where id = request_id and to_uid = caller
    for update;

    if sender is null then raise exception 'Like request is unavailable'; end if;
    if public.is_blocked_pair(sender) then raise exception 'Profile is unavailable'; end if;

    result_chat_id := public.create_or_get_chat(sender, kind);
    delete from public.like_requests
    where request_type = kind
      and ((from_uid = caller and to_uid = sender) or (from_uid = sender and to_uid = caller));
    return result_chat_id;
end;
$$;

create or replace function public.send_chat_message(
    message_id text,
    target_chat_id uuid,
    message_text text,
    message_image_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    peer_uid uuid;
    current_unread integer;
    preview text;
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if message_id is null or char_length(message_id) not between 1 and 128 then raise exception 'Invalid message id'; end if;
    if message_text is null and message_image_url is null then raise exception 'Message content is required'; end if;
    if message_text is not null and char_length(message_text) not between 1 and 1000 then raise exception 'Invalid message text'; end if;
    if message_image_url is not null and char_length(message_image_url) > 2048 then raise exception 'Invalid image URL'; end if;

    select participant into peer_uid
    from public.chats, unnest(participants) as participant
    where id = target_chat_id
      and caller = any(participants)
      and participant <> caller
      and not public.is_blocked_pair(participant)
    for update of chats;

    if peer_uid is null then raise exception 'Chat is unavailable'; end if;

    insert into public.messages (id, chat_id, sender_id, text, image_url, created_at, read_by)
    values (message_id, target_chat_id, caller, message_text, message_image_url, now(), array[caller]);

    select case
        when (unread_counts ->> peer_uid::text) ~ '^[0-9]+$' then (unread_counts ->> peer_uid::text)::integer
        else 0
    end into current_unread
    from public.chats
    where id = target_chat_id;

    preview := coalesce(message_text, 'Photo');
    update public.chats
    set last_message = preview,
        last_message_at = now(),
        unread_counts = jsonb_set(unread_counts, array[peer_uid::text], to_jsonb(current_unread + 1), true)
    where id = target_chat_id;
end;
$$;

create or replace function public.mark_chat_read(target_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if not public.is_chat_member(target_chat_id) then raise exception 'Chat is unavailable'; end if;

    update public.chats
    set unread_counts = jsonb_set(unread_counts, array[caller::text], '0'::jsonb, true)
    where id = target_chat_id;

    update public.messages
    set read_by = array(
        select distinct value
        from unnest(read_by || caller) as value
    )
    where chat_id = target_chat_id
      and not caller = any(read_by);
end;
$$;

create or replace function public.recalculate_user_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    target uuid := coalesce(new.to_uid, old.to_uid);
begin
    update public.users
    set rating = coalesce((select avg(rating)::double precision from public.reviews where to_uid = target), 0),
        review_count = (select count(*) from public.reviews where to_uid = target)
    where uid = target;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

create trigger reviews_recalculate_rating
after insert or update or delete on public.reviews
for each row execute function public.recalculate_user_rating();

alter table public.users enable row level security;
alter table public.like_requests enable row level security;
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.device_tokens enable row level security;

create policy users_read_visible on public.users for select to authenticated
using (
    uid = auth.uid()
    or (onboarding_complete and account_state = 'active' and not public.is_blocked_pair(uid))
);
create policy users_create_self on public.users for insert to authenticated
with check (
    uid = auth.uid()
    and rating = 0
    and review_count = 0
    and account_state = 'active'
);
create policy users_update_self on public.users for update to authenticated
using (uid = auth.uid()) with check (uid = auth.uid());

create policy likes_read_participants on public.like_requests for select to authenticated
using (auth.uid() in (from_uid, to_uid));
create policy likes_delete_participants on public.like_requests for delete to authenticated
using (auth.uid() in (from_uid, to_uid));

create policy chats_read_members on public.chats for select to authenticated
using (public.is_chat_member(id));
create policy chats_update_members on public.chats for update to authenticated
using (public.is_chat_member(id)) with check (public.is_chat_member(id));

create policy messages_read_members on public.messages for select to authenticated
using (public.is_chat_member(chat_id));
create policy messages_send_members on public.messages for insert to authenticated
with check (sender_id = auth.uid() and public.is_chat_member(chat_id));
create policy messages_mark_read on public.messages for update to authenticated
using (public.is_chat_member(chat_id)) with check (public.is_chat_member(chat_id));

create policy reviews_read_authenticated on public.reviews for select to authenticated using (true);
create policy reviews_create_after_chat on public.reviews for insert to authenticated
with check (from_uid = auth.uid() and public.can_review(to_uid, chat_id));

create policy stories_read_published on public.stories for select to authenticated
using (is_active and published_at <= now() and (expires_at is null or expires_at > now()));
create policy story_views_read_self on public.story_views for select to authenticated
using (user_id = auth.uid());
create policy story_views_create_self on public.story_views for insert to authenticated
with check (user_id = auth.uid());
create policy story_views_update_self on public.story_views for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy blocks_read_self on public.blocks for select to authenticated
using (blocker_id = auth.uid());
create policy blocks_create_self on public.blocks for insert to authenticated
with check (blocker_id = auth.uid());
create policy blocks_delete_self on public.blocks for delete to authenticated
using (blocker_id = auth.uid());

create policy reports_create_self on public.reports for insert to authenticated
with check (reporter_id = auth.uid());
create policy reports_read_self on public.reports for select to authenticated
using (reporter_id = auth.uid());

create policy device_tokens_manage_self on public.device_tokens for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.users to authenticated;
grant select, delete on public.like_requests to authenticated;
grant select on public.chats to authenticated;
grant select on public.messages to authenticated;
grant select, insert on public.reviews to authenticated;
grant select on public.stories to authenticated;
grant select, insert, update on public.story_views to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert, update, delete on public.device_tokens to authenticated;
revoke all on function public.create_or_get_chat(uuid, text) from public;
revoke all on function public.send_like(uuid, text, text) from public;
revoke all on function public.accept_like_request(text) from public;
revoke all on function public.protect_new_message() from public;
revoke all on function public.send_chat_message(text, uuid, text, text) from public;
revoke all on function public.mark_chat_read(uuid) from public;
grant execute on function public.send_like(uuid, text, text) to authenticated;
grant execute on function public.accept_like_request(text) to authenticated;
grant execute on function public.send_chat_message(text, uuid, text, text) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/heic', 'image/webp']),
    ('chats', 'chats', false, 10485760, array['image/jpeg', 'image/png', 'image/heic', 'image/webp']),
    ('story-media', 'story-media', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy avatar_metadata_read on storage.objects for select to public
using (bucket_id = 'avatars');
create policy avatar_upload_self on storage.objects for insert to authenticated
with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or name = auth.uid()::text || '.jpg')
);
create policy avatar_update_self on storage.objects for update to authenticated
using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or name = auth.uid()::text || '.jpg')
)
with check (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or name = auth.uid()::text || '.jpg')
);
create policy avatar_delete_self on storage.objects for delete to authenticated
using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text or name = auth.uid()::text || '.jpg')
);

create or replace function public.chat_id_from_storage_path(object_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
    select case
        when (storage.foldername(object_name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then ((storage.foldername(object_name))[1])::uuid
        else null
    end;
$$;

revoke all on function public.chat_id_from_storage_path(text) from public;
grant execute on function public.chat_id_from_storage_path(text) to authenticated;

create policy chat_media_read_members on storage.objects for select to authenticated
using (
    bucket_id = 'chats'
    and public.is_chat_member(public.chat_id_from_storage_path(name))
);
create policy chat_media_upload_members on storage.objects for insert to authenticated
with check (
    bucket_id = 'chats'
    and public.is_chat_member(public.chat_id_from_storage_path(name))
);
create policy chat_media_delete_members on storage.objects for delete to authenticated
using (
    bucket_id = 'chats'
    and owner_id = auth.uid()::text
    and public.is_chat_member(public.chat_id_from_storage_path(name))
);

do $$
declare table_name text;
begin
    foreach table_name in array array['users', 'like_requests', 'chats', 'messages', 'stories', 'story_views']
    loop
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
        ) then
            execute format('alter publication supabase_realtime add table public.%I', table_name);
        end if;
    end loop;
end;
$$;

-- Admin-managed community stories. Safe to run repeatedly.
insert into public.stories (
    id, title, subtitle, body, symbol, accent_hex,
    cta_title, cta_url, priority, is_active, published_at
)
values
    (
        '10000000-0000-4000-8000-000000000001',
        'Безопасная игра',
        'Защищайте аккаунт при поиске тиммейтов',
        'Не отправляйте пароли, коды безопасности и платёжные данные. UniShare предназначен для поиска игроков и не поддерживает продажу или передачу аккаунтов.',
        'shield.checkered',
        'E94560',
        null,
        null,
        100,
        true,
        now()
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        'Как работает мэтч',
        'Лайк превращается в чат только при взаимном интересе',
        'Листайте анкеты на главном экране. Если второй пользователь также выберет вашу анкету, UniShare автоматически создаст защищённый чат для обсуждения деталей.',
        'heart.fill',
        'F28C52',
        'Открыть главное',
        'unishare://feed',
        90,
        true,
        now()
    ),
    (
        '10000000-0000-4000-8000-000000000003',
        'Заполните профиль',
        'Игры и платформы улучшают рекомендации',
        'Добавьте платформы, любимые игры и навыки. Чем точнее анкета, тем релевантнее профили в ленте.',
        'person.crop.rectangle.stack.fill',
        '2F7CF6',
        'Редактировать профиль',
        'unishare://profile',
        80,
        true,
        now()
    )
on conflict (id) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    body = excluded.body,
    symbol = excluded.symbol,
    accent_hex = excluded.accent_hex,
    cta_title = excluded.cta_title,
    cta_url = excluded.cta_url,
    priority = excluded.priority,
    is_active = excluded.is_active;

commit;

-- BEGIN PRODUCTION READINESS MIGRATIONS
-- Production readiness: persistent feed decisions, remotely managed non-secret config,
-- account data cleanup, and read-only administrative views for DataGrip.

alter table public.users drop constraint if exists users_platforms_check;
alter table public.users add constraint users_platforms_check check (
    platforms <@ array['Steam', 'Epic Games', 'Nintendo', 'PlayStation', 'Xbox', 'PC', 'Mobile']::text[]
);

create table if not exists public.app_config (
    key text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
    value jsonb not null,
    is_public boolean not null default false,
    description text not null default '' check (char_length(description) <= 500),
    updated_at timestamptz not null default now()
);

drop trigger if exists app_config_touch_updated_at on public.app_config;
create trigger app_config_touch_updated_at
before update on public.app_config
for each row execute function public.touch_updated_at();

insert into public.app_config (key, value, is_public, description) values
    ('game_catalog_enabled', 'true'::jsonb, true, 'Enables the server-side game catalog proxy.'),
    ('game_catalog_provider', '"rawg"'::jsonb, true, 'Active game metadata provider. The provider API key is an Edge Function secret.'),
    ('minimum_supported_version', '"1.0.0"'::jsonb, true, 'Oldest app version allowed to use online services.'),
    ('privacy_policy_url', '"https://egorchulanov.github.io/UniShare/privacy.html"'::jsonb, true, 'Public privacy policy URL.'),
    ('terms_url', '"https://egorchulanov.github.io/UniShare/terms.html"'::jsonb, true, 'Public terms and community rules URL.'),
    ('support_email', '"evchulanov@edu.hse.ru"'::jsonb, true, 'Support and App Review contact email.')
on conflict (key) do nothing;

alter table public.app_config enable row level security;
drop policy if exists app_config_read_public on public.app_config;
create policy app_config_read_public on public.app_config for select to authenticated
using (is_public);

revoke all on public.app_config from anon, authenticated, service_role;
grant select on public.app_config to authenticated;

create table if not exists public.game_catalog_cache (
    cache_key text primary key check (char_length(cache_key) between 3 and 160),
    payload jsonb not null,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

create index if not exists game_catalog_cache_expiry_idx
on public.game_catalog_cache (expires_at);

alter table public.game_catalog_cache enable row level security;
revoke all on public.game_catalog_cache from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.game_catalog_cache to service_role;

create table if not exists public.game_catalog_overrides (
    game_id bigint primary key,
    name text not null check (char_length(name) between 1 and 160),
    background_image text check (background_image is null or char_length(background_image) <= 2048),
    rating numeric check (rating is null or rating between 0 and 5),
    released date,
    search_terms text[] not null default '{}',
    enabled boolean not null default true,
    updated_at timestamptz not null default now()
);

insert into public.game_catalog_overrides (game_id, name, search_terms)
values (-1, 'Fortnite', array['fortnite', 'фортнайт'])
on conflict (game_id) do nothing;

alter table public.game_catalog_overrides enable row level security;
revoke all on public.game_catalog_overrides from public, anon, authenticated, service_role;
grant select on public.game_catalog_overrides to service_role;

create table if not exists public.content_rules (
    id bigserial primary key,
    category text not null check (category in ('credentials', 'payment', 'threat', 'abuse')),
    pattern text not null unique check (char_length(pattern) between 2 and 300),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.content_rules (category, pattern) values
    ('credentials', '(password|passwd|парол(ь|я)|пароль|one[ -]?time code|otp|recovery code|код восстановления|резервн(ый|ые) код)'),
    ('payment', '(cvv|cvc|card number|номер карты|банковск(ая|ой) карт)'),
    ('threat', '(kill yourself|убей себя|я тебя убью|physical threat)'),
    ('abuse', '(child sexual|sexual content involving minors|детск(ая|ое) порнограф)')
on conflict (pattern) do nothing;

alter table public.content_rules enable row level security;
revoke all on public.content_rules from public, anon, authenticated, service_role;

create or replace function public.assert_content_allowed(content text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if content is null or btrim(content) = '' then return; end if;
    if exists (
        select 1 from public.content_rules
        where is_active and content ~* pattern
    ) then
        raise exception 'Content violates community rules';
    end if;
end;
$$;

create or replace function public.moderate_user_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_table_name = 'users' then
        perform public.assert_content_allowed(new.username::text);
        perform public.assert_content_allowed(new.status);
        perform public.assert_content_allowed(new.skills_description);
    elsif tg_table_name = 'messages' then
        perform public.assert_content_allowed(new.text);
    elsif tg_table_name = 'reviews' then
        perform public.assert_content_allowed(new.review_text);
    end if;
    return new;
end;
$$;

drop trigger if exists users_moderate_content on public.users;
create trigger users_moderate_content before insert or update on public.users
for each row execute function public.moderate_user_content();
drop trigger if exists messages_moderate_content on public.messages;
create trigger messages_moderate_content before insert or update on public.messages
for each row execute function public.moderate_user_content();
drop trigger if exists reviews_moderate_content on public.reviews;
create trigger reviews_moderate_content before insert or update on public.reviews
for each row execute function public.moderate_user_content();

revoke all on function public.assert_content_allowed(text) from public, anon, authenticated, service_role;
revoke all on function public.moderate_user_content() from public, anon, authenticated, service_role;

create table if not exists public.swipe_decisions (
    user_id uuid not null references public.users(uid) on delete cascade,
    target_id uuid not null references public.users(uid) on delete cascade,
    context text not null check (context in ('exchange', 'skills')),
    decision text not null check (decision in ('like', 'dislike')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, target_id, context),
    check (user_id <> target_id)
);

create index if not exists swipe_decisions_feed_idx
on public.swipe_decisions (user_id, context, decision, updated_at desc);

drop trigger if exists swipe_decisions_touch_updated_at on public.swipe_decisions;
create trigger swipe_decisions_touch_updated_at
before update on public.swipe_decisions
for each row execute function public.touch_updated_at();

alter table public.swipe_decisions enable row level security;
drop policy if exists swipe_decisions_manage_self on public.swipe_decisions;
create policy swipe_decisions_manage_self on public.swipe_decisions for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.swipe_decisions from anon, authenticated, service_role;
grant select, insert, update, delete on public.swipe_decisions to authenticated;

create or replace function public.record_swipe(target_uid uuid, kind text, swipe_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if target_uid is null or target_uid = caller then raise exception 'Invalid profile'; end if;
    if kind not in ('exchange', 'skills') then raise exception 'Invalid request type'; end if;
    if swipe_decision not in ('like', 'dislike') then raise exception 'Invalid swipe decision'; end if;
    if not exists (
        select 1 from public.users
        where uid = target_uid and onboarding_complete and account_state = 'active'
    ) or public.is_blocked_pair(target_uid) then
        raise exception 'Profile is unavailable';
    end if;

    insert into public.swipe_decisions (user_id, target_id, context, decision)
    values (caller, target_uid, kind, swipe_decision)
    on conflict (user_id, target_id, context)
    do update set decision = excluded.decision, updated_at = now();
end;
$$;

create or replace function public.undo_dislike(target_uid uuid, kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    removed integer;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    delete from public.swipe_decisions
    where user_id = auth.uid()
      and target_id = target_uid
      and context = kind
      and decision = 'dislike'
      and updated_at >= now() - interval '10 minutes';
    get diagnostics removed = row_count;
    return removed = 1;
end;
$$;

create or replace function public.get_feed_profiles(kind text, batch_limit integer default 12)
returns setof public.users
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if kind not in ('exchange', 'skills') then raise exception 'Invalid request type'; end if;
    if batch_limit not between 1 and 30 then raise exception 'Invalid batch limit'; end if;

    return query
    select u.*
    from public.users u
    where u.uid <> auth.uid()
      and u.onboarding_complete
      and u.account_state = 'active'
      and (kind = 'exchange' or u.has_skills_profile)
      and not public.is_blocked_pair(u.uid)
      and not exists (
          select 1 from public.swipe_decisions d
          where d.user_id = auth.uid()
            and d.target_id = u.uid
            and d.context = kind
            and (d.decision = 'like' or d.updated_at >= now() - interval '30 days')
      )
      and not exists (
          select 1 from public.chats c
          where auth.uid() = any(c.participants)
            and u.uid = any(c.participants)
            and c.chat_type = kind
      )
    order by u.updated_at desc, u.created_at desc
    limit batch_limit;
end;
$$;

-- Keep the durable decision in sync with the existing atomic matching RPC.
create or replace function public.send_like(target_uid uuid, kind text, request_id text)
returns table (matched boolean, chat_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    reverse_exists boolean;
    result_chat_id uuid;
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if target_uid is null or caller = target_uid then raise exception 'Invalid profile'; end if;
    if kind not in ('exchange', 'skills') then raise exception 'Invalid request type'; end if;
    if request_id is null or char_length(request_id) not between 3 and 200 then raise exception 'Invalid request id'; end if;
    if not exists (select 1 from public.users where uid = target_uid and onboarding_complete and account_state = 'active') then
        raise exception 'Profile is unavailable';
    end if;
    if public.is_blocked_pair(target_uid) then raise exception 'Profile is unavailable'; end if;

    insert into public.swipe_decisions (user_id, target_id, context, decision)
    values (caller, target_uid, kind, 'like')
    on conflict (user_id, target_id, context)
    do update set decision = 'like', updated_at = now();

    insert into public.like_requests (id, from_uid, to_uid, request_type)
    values (caller::text || '_' || target_uid::text || '_' || kind, caller, target_uid, kind)
    on conflict (from_uid, to_uid, request_type)
    do update set created_at = now();

    select exists (
        select 1 from public.like_requests
        where from_uid = target_uid and to_uid = caller and request_type = kind
    ) into reverse_exists;

    if reverse_exists then
        result_chat_id := public.create_or_get_chat(target_uid, kind);
        delete from public.like_requests
        where request_type = kind
          and ((from_uid = caller and to_uid = target_uid) or (from_uid = target_uid and to_uid = caller));
        return query select true, result_chat_id;
        return;
    end if;

    return query select false, null::uuid;
end;
$$;

create or replace function public.purge_own_storage()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
begin
    if caller is null then raise exception 'Authentication required'; end if;
    delete from storage.objects where owner_id = caller::text;
end;
$$;

revoke all on function public.record_swipe(uuid, text, text) from public, anon, authenticated;
revoke all on function public.undo_dislike(uuid, text) from public, anon, authenticated;
revoke all on function public.get_feed_profiles(text, integer) from public, anon, authenticated;
revoke all on function public.purge_own_storage() from public, anon, authenticated;
grant execute on function public.record_swipe(uuid, text, text) to authenticated;
grant execute on function public.undo_dislike(uuid, text) to authenticated;
grant execute on function public.get_feed_profiles(text, integer) to authenticated;
grant execute on function public.purge_own_storage() to authenticated;

create or replace view public.admin_user_overview as
select
    u.uid,
    au.email,
    u.username,
    u.account_state,
    u.onboarding_complete,
    u.is_online,
    u.last_seen,
    u.rating,
    u.review_count,
    cardinality(u.games) as game_count,
    cardinality(u.platforms) as platform_count,
    u.created_at,
    u.updated_at
from public.users u
join auth.users au on au.id = u.uid;

create or replace view public.admin_moderation_queue as
select
    r.id,
    r.created_at,
    r.state,
    r.reason,
    r.details,
    r.reporter_id,
    reporter.username as reporter_username,
    r.subject_id,
    subject.username as subject_username,
    subject.account_state as subject_account_state,
    r.resolved_at
from public.reports r
join public.users reporter on reporter.uid = r.reporter_id
join public.users subject on subject.uid = r.subject_id;

create or replace view public.admin_product_metrics as
select
    (select count(*) from public.users) as users_total,
    (select count(*) from public.users where onboarding_complete and account_state = 'active') as profiles_active,
    (select count(*) from public.chats) as chats_total,
    (select count(*) from public.messages) as messages_total,
    (select count(*) from public.reports where state in ('open', 'reviewing')) as reports_pending,
    (select count(*) from public.device_tokens) as push_tokens_total,
    (select count(*) from public.game_catalog_cache where expires_at > now()) as game_cache_entries;

revoke all on public.admin_user_overview from public, anon, authenticated, service_role;
revoke all on public.admin_moderation_queue from public, anon, authenticated, service_role;
revoke all on public.admin_product_metrics from public, anon, authenticated, service_role;

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'swipe_decisions'
    ) then
        alter publication supabase_realtime add table public.swipe_decisions;
    end if;
end;
$$;

create or replace function public.register_device_token(
    device_token text,
    token_environment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_uid uuid := auth.uid();
    normalized_token text := lower(trim(device_token));
begin
    if current_uid is null then
        raise exception 'Authentication required';
    end if;
    if normalized_token !~ '^[0-9a-f]{64,200}$' then
        raise exception 'Invalid APNs token';
    end if;
    if token_environment not in ('sandbox', 'production') then
        raise exception 'Invalid APNs environment';
    end if;

    delete from public.device_tokens where token = normalized_token;
    insert into public.device_tokens (user_id, token, environment)
    values (current_uid, normalized_token, token_environment);
end;
$$;

create or replace function public.unregister_device_token(device_token text)
returns void
language sql
security invoker
set search_path = ''
as $$
    delete from public.device_tokens
    where user_id = auth.uid() and token = lower(trim(device_token));
$$;

revoke all on function public.register_device_token(text, text) from public;
revoke all on function public.unregister_device_token(text) from public;
grant execute on function public.register_device_token(text, text) to authenticated;
grant execute on function public.unregister_device_token(text) to authenticated;

-- Remove legacy account-sharing metadata and make the public experience a
-- teammate discovery service. Internal `exchange` identifiers remain for
-- backward compatibility with installed clients and existing chat rows.

update public.users
set subscriptions = coalesce((
    select jsonb_agg(item - 'url' - 'details' - 'shared_slots')
    from jsonb_array_elements(subscriptions) as item
), '[]'::jsonb)
where subscriptions <> '[]'::jsonb;

create or replace function public.sanitize_subscription_metadata(payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select coalesce(jsonb_agg(item - 'url' - 'details' - 'shared_slots'), '[]'::jsonb)
    from jsonb_array_elements(coalesce(payload, '[]'::jsonb)) as item
$$;

create or replace function public.sanitize_profile_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.subscriptions := public.sanitize_subscription_metadata(new.subscriptions);
    return new;
end;
$$;

drop trigger if exists users_sanitize_subscription_metadata on public.users;
create trigger users_sanitize_subscription_metadata
before insert or update of subscriptions on public.users
for each row execute function public.sanitize_profile_subscriptions();

revoke all on function public.sanitize_subscription_metadata(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.sanitize_profile_subscriptions() from public, anon, authenticated, service_role;

insert into public.content_rules (category, pattern) values
    ('credentials', '((sell|trade|transfer|share)[[:space:][:punct:]]{1,12}(my[[:space:]])?((steam|epic|playstation|xbox|nintendo)[[:space:]])?account)'),
    ('credentials', '((продам|обменяю|передам|дам[[:space:]]доступ).{0,24}(аккаунт|акк))')
on conflict (pattern) do update set is_active = true;

update public.stories
set title = 'Безопасная игра',
    subtitle = 'Защищайте аккаунт при поиске тиммейтов',
    body = 'Не отправляйте пароли, коды безопасности и платёжные данные. UniShare предназначен для поиска игроков и не поддерживает продажу или передачу аккаунтов.'
where id = '10000000-0000-4000-8000-000000000001';

update public.stories
set body = 'Добавьте платформы, любимые игры и навыки. Чем точнее анкета, тем релевантнее профили в ленте.'
where id = '10000000-0000-4000-8000-000000000003';

-- END PRODUCTION READINESS MIGRATIONS

-- BEGIN ABUSE RATE LIMIT MIGRATION
-- Per-user write limits protect chats and moderation queues from automated abuse.

create index if not exists messages_sender_created_idx
on public.messages (sender_id, created_at desc);
create index if not exists like_requests_sender_created_idx
on public.like_requests (from_uid, created_at desc);
create index if not exists reports_reporter_created_idx
on public.reports (reporter_id, created_at desc);
create index if not exists reviews_author_created_idx
on public.reviews (from_uid, created_at desc);

create or replace function public.enforce_user_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    recent_count integer;
begin
    if caller is null then raise exception 'Authentication required'; end if;

    if tg_table_name = 'messages' then
        if new.sender_id <> caller then raise exception 'Invalid message sender'; end if;
        select count(*) into recent_count from public.messages
        where sender_id = caller and created_at >= now() - interval '1 minute';
        if recent_count >= 30 then raise exception 'Message rate limit exceeded'; end if;
    elsif tg_table_name = 'like_requests' then
        if new.from_uid <> caller then raise exception 'Invalid request sender'; end if;
        select count(*) into recent_count from public.like_requests
        where from_uid = caller and created_at >= now() - interval '1 minute';
        if recent_count >= 40 then raise exception 'Like rate limit exceeded'; end if;
    elsif tg_table_name = 'reports' then
        if new.reporter_id <> caller then raise exception 'Invalid reporter'; end if;
        select count(*) into recent_count from public.reports
        where reporter_id = caller and created_at >= now() - interval '1 hour';
        if recent_count >= 5 then raise exception 'Report rate limit exceeded'; end if;
    elsif tg_table_name = 'reviews' then
        if new.from_uid <> caller then raise exception 'Invalid review author'; end if;
        select count(*) into recent_count from public.reviews
        where from_uid = caller and created_at >= now() - interval '1 hour';
        if recent_count >= 10 then raise exception 'Review rate limit exceeded'; end if;
    end if;
    return new;
end;
$$;

drop trigger if exists messages_enforce_rate_limit on public.messages;
create trigger messages_enforce_rate_limit before insert on public.messages
for each row execute function public.enforce_user_write_rate_limit();
drop trigger if exists like_requests_enforce_rate_limit on public.like_requests;
create trigger like_requests_enforce_rate_limit before insert on public.like_requests
for each row execute function public.enforce_user_write_rate_limit();
drop trigger if exists reports_enforce_rate_limit on public.reports;
create trigger reports_enforce_rate_limit before insert on public.reports
for each row execute function public.enforce_user_write_rate_limit();
drop trigger if exists reviews_enforce_rate_limit on public.reviews;
create trigger reviews_enforce_rate_limit before insert on public.reviews
for each row execute function public.enforce_user_write_rate_limit();

revoke all on function public.enforce_user_write_rate_limit() from public, anon, authenticated, service_role;

-- END ABUSE RATE LIMIT MIGRATION

-- BEGIN RPC EXECUTION HARDENING
-- Postgres grants EXECUTE on new functions to PUBLIC by default. Keep the
-- Data API surface explicit so anonymous callers cannot invoke privileged RPCs.
do $$
declare
    function_signature regprocedure;
begin
    for function_signature in
        select p.oid::regprocedure
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = any(array[
              'accept_like_request',
              'assert_content_allowed',
              'can_review',
              'chat_id_from_storage_path',
              'create_or_get_chat',
              'enforce_user_write_rate_limit',
              'get_feed_profiles',
              'is_blocked_pair',
              'is_chat_member',
              'mark_chat_read',
              'moderate_user_content',
              'protect_chat_identity',
              'protect_message_content',
              'protect_new_message',
              'protect_user_managed_columns',
              'purge_own_storage',
              'recalculate_user_rating',
              'record_swipe',
              'register_device_token',
              'rls_auto_enable',
              'sanitize_profile_subscriptions',
              'sanitize_subscription_metadata',
              'send_chat_message',
              'send_like',
              'touch_updated_at',
              'undo_dislike',
              'unregister_device_token'
          ])
    loop
        execute format(
            'revoke all on function %s from public, anon, authenticated, service_role',
            function_signature
        );
    end loop;
end;
$$;

grant execute on function public.is_blocked_pair(uuid) to authenticated, service_role;
grant execute on function public.is_chat_member(uuid) to authenticated, service_role;
grant execute on function public.can_review(uuid, uuid) to authenticated, service_role;
grant execute on function public.chat_id_from_storage_path(text) to authenticated, service_role;

grant execute on function public.send_like(uuid, text, text) to authenticated, service_role;
grant execute on function public.accept_like_request(text) to authenticated, service_role;
grant execute on function public.send_chat_message(text, uuid, text, text) to authenticated, service_role;
grant execute on function public.mark_chat_read(uuid) to authenticated, service_role;
grant execute on function public.record_swipe(uuid, text, text) to authenticated, service_role;
grant execute on function public.undo_dislike(uuid, text) to authenticated, service_role;
grant execute on function public.get_feed_profiles(text, integer) to authenticated, service_role;
grant execute on function public.purge_own_storage() to authenticated, service_role;
grant execute on function public.register_device_token(text, text) to authenticated, service_role;
grant execute on function public.unregister_device_token(text) to authenticated, service_role;

alter default privileges in schema public
revoke execute on functions from public, anon, authenticated, service_role;

-- END RPC EXECUTION HARDENING

-- BEGIN DATABASE ADVISOR REMEDIATION
create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);
create index if not exists device_tokens_user_id_idx on public.device_tokens (user_id);
create index if not exists reports_subject_id_idx on public.reports (subject_id);
create index if not exists reviews_chat_id_idx on public.reviews (chat_id);
create index if not exists story_views_user_id_idx on public.story_views (user_id);
create index if not exists swipe_decisions_target_id_idx on public.swipe_decisions (target_id);

alter policy messages_send_members on public.messages
with check (sender_id = (select auth.uid()) and public.is_chat_member(chat_id));

alter policy users_read_visible on public.users
using (
    uid = (select auth.uid())
    or (
        onboarding_complete
        and account_state = 'active'
        and not public.is_blocked_pair(uid)
    )
);
alter policy users_create_self on public.users
with check (
    uid = (select auth.uid())
    and rating = 0
    and review_count = 0
    and account_state = 'active'
);
alter policy users_update_self on public.users
using (uid = (select auth.uid()))
with check (uid = (select auth.uid()));

alter policy likes_read_participants on public.like_requests
using ((select auth.uid()) in (from_uid, to_uid));
alter policy likes_delete_participants on public.like_requests
using ((select auth.uid()) in (from_uid, to_uid));

alter policy reviews_create_after_chat on public.reviews
with check (
    from_uid = (select auth.uid())
    and public.can_review(to_uid, chat_id)
);

alter policy story_views_read_self on public.story_views
using (user_id = (select auth.uid()));
alter policy story_views_create_self on public.story_views
with check (user_id = (select auth.uid()));
alter policy story_views_update_self on public.story_views
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy blocks_read_self on public.blocks
using (blocker_id = (select auth.uid()));
alter policy blocks_create_self on public.blocks
with check (blocker_id = (select auth.uid()));
alter policy blocks_delete_self on public.blocks
using (blocker_id = (select auth.uid()));

alter policy reports_create_self on public.reports
with check (reporter_id = (select auth.uid()));
alter policy reports_read_self on public.reports
using (reporter_id = (select auth.uid()));

alter policy device_tokens_manage_self on public.device_tokens
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy swipe_decisions_manage_self on public.swipe_decisions
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- END DATABASE ADVISOR REMEDIATION

-- BEGIN ACCOUNT DELETION CHAT CLEANUP
create or replace function public.delete_profile_chats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.chats
    where old.uid = any(participants);
    return old;
end;
$$;

revoke all on function public.delete_profile_chats() from public, anon, authenticated, service_role;

drop trigger if exists users_delete_profile_chats on public.users;
create trigger users_delete_profile_chats
before delete on public.users
for each row execute function public.delete_profile_chats();

delete from public.chats c
where exists (
    select 1
    from unnest(c.participants) participant
    where not exists (
        select 1
        from public.users u
        where u.uid = participant
    )
);

-- END ACCOUNT DELETION CHAT CLEANUP
