-- ОДНО ДЕЙСТВИЕ ДЛЯ УСТАНОВКИ ИЛИ ЗАМЕНЫ КЛЮЧА RAWG
-- Запустите весь файл. DataGrip попросит значение RAWG_API_KEY.
-- После успешного выполнения приложение начнёт использовать новый ключ без обновления.

do $$
declare
    new_key text := '${RAWG_API_KEY}';
    existing_id uuid;
begin
    if new_key = '' or new_key like '${%' then
        raise exception 'Введите непустой RAWG_API_KEY в окне DataGrip';
    end if;

    select id into existing_id
    from vault.secrets
    where name = 'unishare_rawg_api_key';

    if existing_id is null then
        perform vault.create_secret(
            new_key,
            'unishare_rawg_api_key',
            'Ключ RAWG для серверного поиска игр UniShare'
        );
    else
        perform vault.update_secret(
            existing_id,
            new_key,
            'unishare_rawg_api_key',
            'Ключ RAWG для серверного поиска игр UniShare'
        );
    end if;

    truncate table public.game_catalog_cache;
end $$;

select name as "секрет",
       length(decrypted_secret) > 0 as "ключ_настроен",
       updated_at as "обновлён"
from vault.decrypted_secrets
where name = 'unishare_rawg_api_key';
