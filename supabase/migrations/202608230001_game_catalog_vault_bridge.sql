-- Lets only the server-side service role read the managed game provider key.
-- Mobile clients cannot execute this function or access Vault directly.
create or replace function public.get_game_catalog_provider_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'unishare_rawg_api_key'
    limit 1
$$;

revoke all on function public.get_game_catalog_provider_key() from public, anon, authenticated;
grant execute on function public.get_game_catalog_provider_key() to service_role;
