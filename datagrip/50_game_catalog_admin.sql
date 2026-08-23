-- UniShare game catalog administration. Run only through a direct PostgreSQL
-- admin connection. The mobile app cannot read Vault or this server-only RPC.

-- Safe status view: it never prints the decrypted API key.
select name,
       description,
       created_at,
       updated_at,
       length(decrypted_secret) > 0 as configured
from vault.decrypted_secrets
where name = 'unishare_rawg_api_key';

-- CREATE OR ROTATE RAWG KEY:
-- 1. Select the block below.
-- 2. Run it. DataGrip will ask for RAWG_API_KEY.
-- 3. Run the safe status query above and confirm configured = true.
-- do $$
-- declare
--     new_key text := '${RAWG_API_KEY}';
--     secret_id uuid;
-- begin
--     if new_key = '' or new_key like '${%' then
--         raise exception 'RAWG_API_KEY must not be empty';
--     end if;
--
--     select id into secret_id
--     from vault.secrets
--     where name = 'unishare_rawg_api_key';
--
--     if secret_id is null then
--         perform vault.create_secret(
--             new_key,
--             'unishare_rawg_api_key',
--             'RAWG provider key used only by the game-search Edge Function'
--         );
--     else
--         perform vault.update_secret(
--             secret_id,
--             new_key,
--             'unishare_rawg_api_key',
--             'RAWG provider key used only by the game-search Edge Function'
--         );
--     end if;
-- end $$;

-- Clear cached searches after changing provider data.
-- truncate table public.game_catalog_cache;

-- Curated fallback/override. Negative IDs are reserved for UniShare entries.
select game_id, name, background_image, rating, released, search_terms, enabled, updated_at
from public.game_catalog_overrides
order by name;

-- Example upsert. Select only the statement after replacing values.
-- insert into public.game_catalog_overrides (
--     game_id, name, background_image, rating, released, search_terms, enabled
-- ) values (
--     -1001, '${FULL_GAME_NAME}', '${HTTPS_COVER_URL}', null, null,
--     array['${SEARCH_TERM_EN}', '${SEARCH_TERM_LOCAL}'], true
-- )
-- on conflict (game_id) do update
-- set name = excluded.name,
--     background_image = excluded.background_image,
--     search_terms = excluded.search_terms,
--     enabled = excluded.enabled,
--     updated_at = now()
-- returning *;
