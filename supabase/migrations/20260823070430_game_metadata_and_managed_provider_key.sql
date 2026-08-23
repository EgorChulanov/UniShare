-- Persist the exact catalog result selected by the user so feed cards do not
-- depend on a new provider lookup every time they are rendered.
alter table public.users
add column if not exists game_metadata jsonb not null default '{}'::jsonb;

alter table public.users drop constraint if exists users_game_metadata_object_check;
alter table public.users add constraint users_game_metadata_object_check
check (jsonb_typeof(game_metadata) = 'object');

-- RAWG can be rotated from a direct PostgreSQL connection (for example
-- DataGrip) without shipping a new app or exposing the key to mobile clients.
do $migration$
begin
    if exists (select 1 from pg_available_extensions where name = 'supabase_vault') then
        execute 'create extension if not exists supabase_vault with schema vault';
        execute $ddl$
            create or replace function public.get_game_catalog_api_key()
            returns text
            language sql
            stable
            security definer
            set search_path = ''
            as $function$
                select decrypted_secret
                from vault.decrypted_secrets
                where name = 'unishare_rawg_api_key'
                order by updated_at desc
                limit 1;
            $function$;
        $ddl$;
        execute 'revoke all on function public.get_game_catalog_api_key() from public, anon, authenticated';
        execute 'grant execute on function public.get_game_catalog_api_key() to service_role';
        execute $ddl$
            comment on function public.get_game_catalog_api_key() is
            'Server-only RAWG credential lookup. Never grant this function to app roles.'
        $ddl$;
    else
        raise notice 'supabase_vault is unavailable; skipping managed provider key RPC';
    end if;
end
$migration$;
