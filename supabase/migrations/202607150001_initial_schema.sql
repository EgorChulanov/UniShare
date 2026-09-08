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

create policy avatar_metadata_read on storage.objects for select to authenticated
using (bucket_id = 'avatars');
create policy avatar_upload_self on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');
create policy avatar_update_self on storage.objects for update to authenticated
using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg')
with check (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');
create policy avatar_delete_self on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and name = auth.uid()::text || '.jpg');

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
