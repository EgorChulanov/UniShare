-- Repeated blocking uses UPSERT, so Postgres also needs a tightly scoped
-- UPDATE permission for rows owned by the current user.
drop policy if exists blocks_update_self on public.blocks;
create policy blocks_update_self
on public.blocks
for update
to authenticated
using (blocker_id = (select auth.uid()))
with check (
    blocker_id = (select auth.uid())
    and blocked_id <> (select auth.uid())
);

grant update on public.blocks to authenticated;

-- Storage objects must be removed through the Storage API. This RPC only
-- deletes database records after the iOS client has attempted media cleanup.
create or replace function public.delete_chat(target_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
begin
    if caller is null then
        raise exception 'Authentication required';
    end if;
    if not exists (
        select 1 from public.chats
        where id = target_chat_id and caller = any(participants)
    ) then
        raise exception 'Chat is unavailable';
    end if;
    delete from public.chats where id = target_chat_id;
end;
$$;

revoke all on function public.delete_chat(uuid) from public, anon;
grant execute on function public.delete_chat(uuid) to authenticated;
