create or replace function public.delete_chat(target_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
begin
    if caller is null then raise exception 'Authentication required'; end if;
    if not exists (
        select 1 from public.chats
        where id = target_chat_id and caller = any(participants)
    ) then
        raise exception 'Chat is unavailable';
    end if;

    delete from storage.objects
    where bucket_id = 'chats' and name like target_chat_id::text || '/%';
    delete from public.chats where id = target_chat_id;
end;
$$;

revoke all on function public.delete_chat(uuid) from public, anon;
grant execute on function public.delete_chat(uuid) to authenticated;
