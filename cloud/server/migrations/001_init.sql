-- UniShare unified schema (PostgreSQL 14+).
-- Portable port of supabase/migrations: no dependency on Supabase Auth, RLS or
-- Storage. The API server is the only database client and enforces access.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ── Accounts ────────────────────────────────────────────────────────────────

create table users (
    uid uuid primary key default gen_random_uuid(),
    username citext unique check (username is null or char_length(username) between 3 and 30),
    avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
    status text check (char_length(status) <= 180),
    platforms text[] not null default '{}',
    platform_games jsonb not null default '{}'::jsonb check (jsonb_typeof(platform_games) = 'object'),
    games text[] not null default '{}',
    wanted_games text[] not null default '{}',
    game_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(game_metadata) = 'object'),
    skills text[] not null default '{}',
    skills_description text check (char_length(skills_description) <= 600),
    has_skills_profile boolean not null default false,
    subscriptions jsonb not null default '[]'::jsonb check (jsonb_typeof(subscriptions) = 'array'),
    language text not null default 'ru' check (language in ('ru', 'en', 'uk', 'be')),
    allow_direct_contact boolean not null default false,
    onboarding_complete boolean not null default false,
    is_online boolean not null default false,
    last_seen timestamptz,
    rating double precision not null default 0 check (rating between 0 and 5),
    review_count integer not null default 0 check (review_count >= 0),
    account_state text not null default 'active' check (account_state in ('active', 'suspended', 'banned')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (platforms <@ array['Steam', 'Epic Games', 'Nintendo', 'PlayStation', 'Xbox', 'PC', 'Mobile']::text[])
);

create index users_feed_idx on users (onboarding_complete, account_state, updated_at desc);
create index users_skills_idx on users (has_skills_profile) where has_skills_profile;
create index users_games_gin_idx on users using gin (games);
create index users_platforms_gin_idx on users using gin (platforms);

-- One UniShare account can sign in from several platforms (Telegram, VK, ...).
create table user_identities (
    provider text not null check (provider in ('telegram', 'vk', 'dev')),
    provider_user_id text not null check (char_length(provider_user_id) between 1 and 64),
    user_id uuid not null references users(uid) on delete cascade,
    username text,
    display_name text,
    photo_url text,
    language_code text,
    can_message boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (provider, provider_user_id),
    unique (user_id, provider)
);

create table sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(uid) on delete cascade,
    token_hash text not null unique,
    client text not null check (client in ('telegram', 'vk', 'web')),
    created_at timestamptz not null default now(),
    last_used_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

-- Short-lived tokens that attach another platform to an existing account.
create table link_tokens (
    token_hash text primary key,
    user_id uuid not null references users(uid) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

-- ── Discovery ───────────────────────────────────────────────────────────────

create table swipe_decisions (
    user_id uuid not null references users(uid) on delete cascade,
    target_id uuid not null references users(uid) on delete cascade,
    context text not null check (context in ('teammates', 'skills')),
    decision text not null check (decision in ('like', 'dislike')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, target_id, context),
    check (user_id <> target_id)
);

create index swipe_decisions_feed_idx on swipe_decisions (user_id, context, decision, updated_at desc);

create table like_requests (
    id uuid primary key default gen_random_uuid(),
    from_uid uuid not null references users(uid) on delete cascade,
    to_uid uuid not null references users(uid) on delete cascade,
    request_type text not null check (request_type in ('teammates', 'skills')),
    created_at timestamptz not null default now(),
    check (from_uid <> to_uid),
    unique (from_uid, to_uid, request_type)
);

create index like_requests_inbox_idx on like_requests (to_uid, request_type, created_at desc);
create index like_requests_sender_created_idx on like_requests (from_uid, created_at desc);

-- ── Chats ───────────────────────────────────────────────────────────────────

-- Two-person chats. user_low < user_high keeps one chat per pair and kind.
create table chats (
    id uuid primary key default gen_random_uuid(),
    user_low uuid not null references users(uid) on delete cascade,
    user_high uuid not null references users(uid) on delete cascade,
    chat_type text not null check (chat_type in ('teammates', 'skills')),
    last_message text not null default '' check (char_length(last_message) <= 1000),
    last_message_at timestamptz not null default now(),
    last_sender_id uuid,
    unread_low integer not null default 0 check (unread_low >= 0),
    unread_high integer not null default 0 check (unread_high >= 0),
    hidden_for uuid[] not null default '{}',
    created_at timestamptz not null default now(),
    check (user_low < user_high),
    unique (user_low, user_high, chat_type)
);

create index chats_low_idx on chats (user_low, last_message_at desc);
create index chats_high_idx on chats (user_high, last_message_at desc);

create table messages (
    id uuid primary key,
    chat_id uuid not null references chats(id) on delete cascade,
    sender_id uuid not null references users(uid) on delete cascade,
    text text check (char_length(text) between 1 and 1000),
    image_url text check (image_url is null or char_length(image_url) <= 2048),
    created_at timestamptz not null default now(),
    read_at timestamptz,
    check (text is not null or image_url is not null)
);

create index messages_chat_created_idx on messages (chat_id, created_at desc);
create index messages_sender_created_idx on messages (sender_id, created_at desc);

-- ── Trust & safety ──────────────────────────────────────────────────────────

create table reviews (
    id uuid primary key default gen_random_uuid(),
    from_uid uuid not null references users(uid) on delete cascade,
    to_uid uuid not null references users(uid) on delete cascade,
    chat_id uuid references chats(id) on delete set null,
    rating integer not null check (rating between 1 and 5),
    review_text text check (char_length(review_text) <= 1000),
    created_at timestamptz not null default now(),
    check (from_uid <> to_uid),
    unique (from_uid, to_uid, chat_id)
);

create index reviews_target_idx on reviews (to_uid, created_at desc);
create index reviews_author_created_idx on reviews (from_uid, created_at desc);

create or replace function recalculate_user_rating()
returns trigger
language plpgsql
as $$
declare
    target uuid := coalesce(new.to_uid, old.to_uid);
begin
    update users
    set rating = coalesce((select avg(rating)::double precision from reviews where to_uid = target), 0),
        review_count = (select count(*) from reviews where to_uid = target)
    where uid = target;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end;
$$;

create trigger reviews_recalculate_rating
after insert or update or delete on reviews
for each row execute function recalculate_user_rating();

create table blocks (
    blocker_id uuid not null references users(uid) on delete cascade,
    blocked_id uuid not null references users(uid) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on blocks (blocked_id);

create table reports (
    id uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references users(uid) on delete cascade,
    subject_id uuid not null references users(uid) on delete cascade,
    reason text not null check (char_length(reason) between 3 and 80),
    details text not null default '' check (char_length(details) <= 1500),
    state text not null default 'open' check (state in ('open', 'reviewing', 'resolved', 'rejected')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    check (reporter_id <> subject_id)
);

create index reports_reporter_created_idx on reports (reporter_id, created_at desc);
create index reports_state_idx on reports (state, created_at desc);

-- Regular expressions (PostgreSQL syntax) that block credentials, payment data,
-- threats and abuse in usernames, statuses, messages and reviews.
create table content_rules (
    id bigserial primary key,
    category text not null check (category in ('credentials', 'payment', 'threat', 'abuse')),
    pattern text not null unique check (char_length(pattern) between 2 and 300),
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

insert into content_rules (category, pattern) values
    ('credentials', '(password|passwd|парол(ь|я)|пароль|one[ -]?time code|otp|recovery code|код восстановления|резервн(ый|ые) код)'),
    ('payment', '(cvv|cvc|card number|номер карты|банковск(ая|ой) карт)'),
    ('threat', '(kill yourself|убей себя|я тебя убью|physical threat)'),
    ('abuse', '(child sexual|sexual content involving minors|детск(ая|ое) порнограф)')
on conflict (pattern) do nothing;

-- ── Community stories ───────────────────────────────────────────────────────

create table stories (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 64),
    subtitle text not null default '' check (char_length(subtitle) <= 120),
    body text not null default '' check (char_length(body) <= 3000),
    image_url text,
    symbol text not null default 'sparkles',
    accent_hex char(6) not null default '0057FF' check (accent_hex ~ '^[0-9A-Fa-f]{6}$'),
    cta_title text check (char_length(cta_title) <= 40),
    cta_url text,
    language text check (language is null or language in ('ru', 'en', 'uk', 'be')),
    priority integer not null default 0,
    is_active boolean not null default true,
    published_at timestamptz not null default now(),
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    check (expires_at is null or expires_at > published_at)
);

create index stories_published_idx on stories (is_active, priority desc, published_at desc);

create table story_views (
    story_id uuid not null references stories(id) on delete cascade,
    user_id uuid not null references users(uid) on delete cascade,
    viewed_at timestamptz not null default now(),
    primary key (story_id, user_id)
);

-- ── Game catalog proxy cache ────────────────────────────────────────────────

create table game_catalog_cache (
    cache_key text primary key check (char_length(cache_key) between 3 and 160),
    payload jsonb not null,
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

create index game_catalog_cache_expiry_idx on game_catalog_cache (expires_at);

create table game_catalog_overrides (
    game_id bigint primary key,
    name text not null check (char_length(name) between 1 and 160),
    background_image text,
    released date,
    search_terms text[] not null default '{}',
    enabled boolean not null default true,
    updated_at timestamptz not null default now()
);

insert into game_catalog_overrides (game_id, name, search_terms)
values (-1, 'Fortnite', array['fortnite', 'фортнайт'])
on conflict (game_id) do nothing;

-- ── Shared helpers ──────────────────────────────────────────────────────────

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger users_touch_updated_at before update on users
for each row
when (old.* is distinct from new.* and (old.is_online, old.last_seen) is not distinct from (new.is_online, new.last_seen))
execute function touch_updated_at();

create trigger identities_touch_updated_at before update on user_identities
for each row execute function touch_updated_at();

create trigger swipe_decisions_touch_updated_at before update on swipe_decisions
for each row execute function touch_updated_at();

-- Read-only views for operators (DataGrip / psql).
create view admin_overview as
select
    (select count(*) from users) as users_total,
    (select count(*) from users where onboarding_complete) as users_onboarded,
    (select count(*) from users where last_seen > now() - interval '1 day') as users_active_24h,
    (select count(*) from user_identities where provider = 'telegram') as telegram_identities,
    (select count(*) from user_identities where provider = 'vk') as vk_identities,
    (select count(*) from chats) as chats_total,
    (select count(*) from messages where created_at > now() - interval '1 day') as messages_24h,
    (select count(*) from reports where state = 'open') as reports_open;
