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
