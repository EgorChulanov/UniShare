-- Align the stored discovery type with the public teammate-discovery product.
-- The legacy input alias is accepted only so build 1 cannot corrupt existing data.

alter table public.like_requests drop constraint if exists like_requests_request_type_check;
alter table public.chats drop constraint if exists chats_chat_type_check;
alter table public.swipe_decisions drop constraint if exists swipe_decisions_context_check;

update public.like_requests
set id = regexp_replace(id, '_exchange$', '_teammates'),
    request_type = 'teammates'
where request_type = 'exchange';

update public.chats set chat_type = 'teammates' where chat_type = 'exchange';
update public.swipe_decisions set context = 'teammates' where context = 'exchange';

alter table public.like_requests
add constraint like_requests_request_type_check check (request_type in ('teammates', 'skills'));
alter table public.chats
add constraint chats_chat_type_check check (chat_type in ('teammates', 'skills'));
alter table public.swipe_decisions
add constraint swipe_decisions_context_check check (context in ('teammates', 'skills'));

create or replace function public.normalize_discovery_kind(kind text)
returns text
language sql
immutable
set search_path = ''
as $$
    select case
        when kind = 'exchange' then 'teammates'
        when kind in ('teammates', 'skills') then kind
        else null
    end
$$;

revoke all on function public.normalize_discovery_kind(text) from public, anon, authenticated, service_role;

create or replace function public.create_or_get_chat(other_uid uuid, kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    canonical_kind text := public.normalize_discovery_kind(kind);
    result_id uuid;
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if other_uid is null or caller = other_uid then raise exception 'Invalid participant'; end if;
    if canonical_kind is null then raise exception 'Invalid chat type'; end if;
    if not exists (select 1 from public.users where uid = other_uid and account_state = 'active') then
        raise exception 'Profile is unavailable';
    end if;
    if public.is_blocked_pair(other_uid) then raise exception 'Profile is unavailable'; end if;

    insert into public.chats (participants, chat_type, unread_counts)
    values (
        array[caller, other_uid],
        canonical_kind,
        jsonb_build_object(caller::text, 0, other_uid::text, 0)
    )
    on conflict (participant_low, participant_high, chat_type) do nothing
    returning id into result_id;

    if result_id is null then
        select id into result_id
        from public.chats
        where participant_low = least(caller, other_uid)
          and participant_high = greatest(caller, other_uid)
          and chat_type = canonical_kind;
    end if;
    return result_id;
end;
$$;

create or replace function public.record_swipe(target_uid uuid, kind text, swipe_decision text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    canonical_kind text := public.normalize_discovery_kind(kind);
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if target_uid is null or target_uid = caller then raise exception 'Invalid profile'; end if;
    if canonical_kind is null then raise exception 'Invalid request type'; end if;
    if swipe_decision not in ('like', 'dislike') then raise exception 'Invalid swipe decision'; end if;
    if not exists (
        select 1 from public.users
        where uid = target_uid and onboarding_complete and account_state = 'active'
    ) or public.is_blocked_pair(target_uid) then
        raise exception 'Profile is unavailable';
    end if;

    insert into public.swipe_decisions (user_id, target_id, context, decision)
    values (caller, target_uid, canonical_kind, swipe_decision)
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
    canonical_kind text := public.normalize_discovery_kind(kind);
    removed integer;
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if canonical_kind is null then raise exception 'Invalid request type'; end if;
    delete from public.swipe_decisions
    where user_id = auth.uid()
      and target_id = target_uid
      and context = canonical_kind
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
declare
    canonical_kind text := public.normalize_discovery_kind(kind);
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if canonical_kind is null then raise exception 'Invalid request type'; end if;
    if batch_limit not between 1 and 30 then raise exception 'Invalid batch limit'; end if;

    return query
    select u.*
    from public.users u
    where u.uid <> auth.uid()
      and u.onboarding_complete
      and u.account_state = 'active'
      and (canonical_kind = 'teammates' or u.has_skills_profile)
      and not public.is_blocked_pair(u.uid)
      and not exists (
          select 1 from public.swipe_decisions d
          where d.user_id = auth.uid()
            and d.target_id = u.uid
            and d.context = canonical_kind
            and (d.decision = 'like' or d.updated_at >= now() - interval '30 days')
      )
      and not exists (
          select 1 from public.chats c
          where auth.uid() = any(c.participants)
            and u.uid = any(c.participants)
            and c.chat_type = canonical_kind
      )
    order by u.updated_at desc, u.created_at desc
    limit batch_limit;
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
    canonical_kind text := public.normalize_discovery_kind(kind);
    reverse_exists boolean;
    result_chat_id uuid;
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if target_uid is null or caller = target_uid then raise exception 'Invalid profile'; end if;
    if canonical_kind is null then raise exception 'Invalid request type'; end if;
    if request_id is null or char_length(request_id) not between 3 and 200 then raise exception 'Invalid request id'; end if;
    if not exists (select 1 from public.users where uid = target_uid and onboarding_complete and account_state = 'active') then
        raise exception 'Profile is unavailable';
    end if;
    if public.is_blocked_pair(target_uid) then raise exception 'Profile is unavailable'; end if;

    insert into public.swipe_decisions (user_id, target_id, context, decision)
    values (caller, target_uid, canonical_kind, 'like')
    on conflict (user_id, target_id, context)
    do update set decision = 'like', updated_at = now();

    insert into public.like_requests (id, from_uid, to_uid, request_type)
    values (caller::text || '_' || target_uid::text || '_' || canonical_kind, caller, target_uid, canonical_kind)
    on conflict (from_uid, to_uid, request_type)
    do update set created_at = now();

    select exists (
        select 1 from public.like_requests
        where from_uid = target_uid and to_uid = caller and request_type = canonical_kind
    ) into reverse_exists;

    if reverse_exists then
        result_chat_id := public.create_or_get_chat(target_uid, canonical_kind);
        delete from public.like_requests
        where request_type = canonical_kind
          and ((from_uid = caller and to_uid = target_uid) or (from_uid = target_uid and to_uid = caller));
        return query select true, result_chat_id;
        return;
    end if;

    return query select false, null::uuid;
end;
$$;

revoke all on function public.create_or_get_chat(uuid, text) from public, anon, authenticated;
revoke all on function public.record_swipe(uuid, text, text) from public, anon;
revoke all on function public.undo_dislike(uuid, text) from public, anon;
revoke all on function public.get_feed_profiles(text, integer) from public, anon;
revoke all on function public.send_like(uuid, text, text) from public, anon;

grant execute on function public.record_swipe(uuid, text, text) to authenticated, service_role;
grant execute on function public.undo_dislike(uuid, text) to authenticated, service_role;
grant execute on function public.get_feed_profiles(text, integer) to authenticated, service_role;
grant execute on function public.send_like(uuid, text, text) to authenticated, service_role;
