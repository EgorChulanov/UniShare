-- УПРАВЛЕНИЕ КАТАЛОГОМ ИГР UNISHARE
-- Запускайте только через прямое администраторское подключение PostgreSQL.
-- Мобильное приложение не может читать Vault и закрытые серверные функции.

-- Безопасная проверка: сам API-ключ никогда не выводится.
select name as "название_секрета",
       description as "описание",
       created_at as "создан",
       updated_at as "обновлён",
       length(decrypted_secret) > 0 as "ключ_настроен"
from vault.decrypted_secrets
where name = 'unishare_rawg_api_key';

-- СОЗДАТЬ ИЛИ ЗАМЕНИТЬ КЛЮЧ RAWG
-- 1. Снимите комментарий с блока ниже и выделите только его.
-- 2. Запустите блок. DataGrip попросит RAWG_API_KEY.
-- 3. Запустите безопасную проверку выше: «ключ_настроен» должен быть true.
-- Серверная game-search функция автоматически читает этот ключ из Vault;
-- переустанавливать приложение после замены ключа не требуется.
-- do $$
-- declare
--     new_key text := '${RAWG_API_KEY}';
--     secret_id uuid;
-- begin
--     if new_key = '' or new_key like '${%' then
--         raise exception 'RAWG_API_KEY не может быть пустым';
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
--             'Ключ RAWG, доступный только серверной функции поиска игр'
--         );
--     else
--         perform vault.update_secret(
--             secret_id,
--             new_key,
--             'unishare_rawg_api_key',
--             'Ключ RAWG, доступный только серверной функции поиска игр'
--         );
--     end if;
-- end $$;

-- ОЧИСТИТЬ КЭШ ПОСЛЕ ЗАМЕНЫ КЛЮЧА ИЛИ ДАННЫХ ПОСТАВЩИКА
-- truncate table public.game_catalog_cache;

-- Игры, добавленные вручную. Отрицательные id зарезервированы для UniShare.
select game_id as "id_игры",
       name as "название",
       background_image as "обложка",
       rating as "рейтинг",
       released as "дата_выхода",
       search_terms as "варианты_поиска",
       enabled as "включена",
       updated_at as "обновлено"
from public.game_catalog_overrides
order by name;

-- ДОБАВИТЬ ИЛИ ИЗМЕНИТЬ ИГРУ ВРУЧНУЮ
-- Снимите комментарий, замените значения и запустите только этот блок.
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
