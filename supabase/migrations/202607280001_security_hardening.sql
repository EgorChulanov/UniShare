-- Apply to existing hosted projects after 202607150001_initial_schema.sql.

drop table if exists public.ai_requests;

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
    end if;

    return query select false, null::uuid;
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

revoke all on function public.create_or_get_chat(uuid, text) from public, anon, authenticated;
revoke all on function public.send_like(uuid, text, text) from public;
revoke all on function public.accept_like_request(text) from public;
grant execute on function public.send_like(uuid, text, text) to authenticated;
grant execute on function public.accept_like_request(text) to authenticated;

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

drop trigger if exists messages_protect_insert on public.messages;
create trigger messages_protect_insert
before insert on public.messages
for each row execute function public.protect_new_message();

revoke all on function public.protect_new_message() from public, anon, authenticated;

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

revoke insert, update on public.messages from authenticated;
revoke update on public.chats from authenticated;
revoke all on function public.send_chat_message(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_chat_read(uuid) from public, anon, authenticated;
grant execute on function public.send_chat_message(text, uuid, text, text) to authenticated;
grant execute on function public.mark_chat_read(uuid) to authenticated;
