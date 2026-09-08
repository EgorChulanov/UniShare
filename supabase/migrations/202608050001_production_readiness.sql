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
