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
