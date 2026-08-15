\set ON_ERROR_STOP on

insert into auth.users (id) values
    ('00000000-0000-4000-8000-000000000001'),
    ('00000000-0000-4000-8000-000000000002'),
    ('00000000-0000-4000-8000-000000000003');

insert into public.users (uid, username, onboarding_complete, platforms) values
    ('00000000-0000-4000-8000-000000000001', 'alice', true, array['Steam', 'Epic Games']),
    ('00000000-0000-4000-8000-000000000002', 'bob', true, array['Xbox']),
    ('00000000-0000-4000-8000-000000000003', 'mallory', true, array['Mobile']);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);

update public.users
set subscriptions = '[{"name":"Discord","icon_name":"bubble.left.fill","url":"https://example.test/invite","details":"family access","shared_slots":4}]'::jsonb
where uid = '00000000-0000-4000-8000-000000000001';

do $$
begin
    if exists (
        select 1
        from public.users u,
             jsonb_array_elements(u.subscriptions) item
        where u.uid = '00000000-0000-4000-8000-000000000001'
          and (item ? 'url' or item ? 'details' or item ? 'shared_slots')
    ) then raise exception 'account-sharing subscription metadata was persisted'; end if;
end;
$$;

do $$
begin
    if not exists (
        select 1 from public.get_feed_profiles('exchange', 10)
        where uid = '00000000-0000-4000-8000-000000000002'
    ) then raise exception 'eligible profile is missing from feed'; end if;
end;
$$;

select public.record_swipe('00000000-0000-4000-8000-000000000002', 'exchange', 'dislike');
do $$
begin
    if exists (
        select 1 from public.get_feed_profiles('exchange', 10)
        where uid = '00000000-0000-4000-8000-000000000002'
    ) then raise exception 'disliked profile remained in feed'; end if;
end;
$$;

do $$
begin
    if not public.undo_dislike('00000000-0000-4000-8000-000000000002', 'exchange') then
        raise exception 'recent dislike could not be undone';
    end if;
end;
$$;

do $$
begin
    update public.app_config set value = 'false'::jsonb where key = 'game_catalog_enabled';
    raise exception 'authenticated client modified remote configuration';
exception
    when insufficient_privilege then null;
end;
$$;

do $$
begin
    perform public.create_or_get_chat('00000000-0000-4000-8000-000000000002', 'exchange');
    raise exception 'create_or_get_chat must not be callable by authenticated users';
exception
    when insufficient_privilege then null;
end;
$$;

select * from public.send_like(
    '00000000-0000-4000-8000-000000000002',
    'exchange',
    'attacker-controlled-id'
);

do $$
begin
    if not exists (
        select 1 from public.like_requests
        where id = '00000000-0000-4000-8000-000000000001_00000000-0000-4000-8000-000000000002_exchange'
    ) then
        raise exception 'send_like accepted a caller-controlled identifier';
    end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
do $$
begin
    perform public.accept_like_request(
        '00000000-0000-4000-8000-000000000001_00000000-0000-4000-8000-000000000002_exchange'
    );
    raise exception 'a third party accepted another user request';
exception
    when raise_exception then
        if sqlerrm <> 'Like request is unavailable' then raise; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public.accept_like_request(
    '00000000-0000-4000-8000-000000000001_00000000-0000-4000-8000-000000000002_exchange'
);

do $$
begin
    perform public.send_chat_message(
        'blocked-account-sale-message',
        (select id from public.chats limit 1),
        'sell my Steam account',
        null
    );
    raise exception 'account sale bypassed content filtering';
exception
    when raise_exception then
        if sqlerrm <> 'Content violates community rules' then raise; end if;
end;
$$;

do $$
begin
    perform public.send_chat_message(
        'blocked-credential-message',
        (select id from public.chats limit 1),
        'send me your password',
        null
    );
    raise exception 'credential request bypassed content filtering';
exception
    when raise_exception then
        if sqlerrm <> 'Content violates community rules' then raise; end if;
end;
$$;

do $$
begin
    insert into public.messages (id, chat_id, sender_id, text, read_by)
    select
        'forged-message',
        id,
        '00000000-0000-4000-8000-000000000001',
        'forged',
        array['00000000-0000-4000-8000-000000000001'::uuid]
    from public.chats
    limit 1;
    raise exception 'authenticated users must not insert messages directly';
exception
    when insufficient_privilege then null;
end;
$$;

select public.send_chat_message(
    'security-message',
    (select id from public.chats limit 1),
    'hello',
    null
);

do $$
begin
    if not exists (
        select 1 from public.messages
        where id = 'security-message'
          and sender_id = '00000000-0000-4000-8000-000000000002'
          and read_by = array['00000000-0000-4000-8000-000000000002'::uuid]
    ) then
        raise exception 'message identity was not protected';
    end if;
end;
$$;

do $$
declare
    i integer;
begin
    for i in 1..29 loop
        perform public.send_chat_message(
            format('rate-message-%s', i),
            (select id from public.chats limit 1),
            format('rate test %s', i),
            null
        );
    end loop;
    perform public.send_chat_message(
        'rate-message-blocked',
        (select id from public.chats limit 1),
        'must be blocked',
        null
    );
    raise exception 'message rate limit was bypassed';
exception
    when raise_exception then
        if sqlerrm <> 'Message rate limit exceeded' then raise; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
do $$
begin
    update public.messages
    set text = 'tampered'
    where id = 'security-message';
    raise exception 'authenticated users must not update messages directly';
exception
    when insufficient_privilege then null;
end;
$$;

select public.mark_chat_read((select id from public.chats limit 1));

do $$
begin
    if not exists (
        select 1 from public.messages
        where id = 'security-message'
          and text = 'hello'
          and read_by @> array[
              '00000000-0000-4000-8000-000000000001'::uuid,
              '00000000-0000-4000-8000-000000000002'::uuid
          ]
          and exists (
              select 1 from public.chats
              where id = messages.chat_id
                and unread_counts ->> '00000000-0000-4000-8000-000000000001' = '0'
          )
    ) then
        raise exception 'message content or read receipt was forged';
    end if;
end;
$$;

reset role;
select 'Supabase security smoke passed' as result;
