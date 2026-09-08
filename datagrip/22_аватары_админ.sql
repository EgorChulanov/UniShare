-- КАТАЛОГ ГОТОВЫХ АВАТАРОВ UNISHARE
-- Все изображения неофициальные; лицензия и источник хранятся в каждой строке.

select id,
       category as "раздел",
       image_url as "изображение",
       sort_order as "порядок",
       license_name as "лицензия",
       attribution_url as "источник",
       is_official as "официальный",
       is_active as "показывать"
from public.avatar_presets
order by category, sort_order;

-- СКРЫТЬ АВАТАР
-- update public.avatar_presets
-- set is_active = false
-- where id = '${AVATAR_ID}'
-- returning *;

-- ВЕРНУТЬ АВАТАР
-- update public.avatar_presets
-- set is_active = true
-- where id = '${AVATAR_ID}'
-- returning *;

-- ДОБАВИТЬ СВОЙ ЛИЦЕНЗИРОВАННЫЙ АВАТАР
-- CATEGORY: playstation, nintendo, xbox или pc.
-- OFFICIAL оставляйте false, если у вас нет письменного разрешения правообладателя.
-- insert into public.avatar_presets (
--     id, category, image_url, sort_order, license_name,
--     attribution_url, is_official, is_active
-- ) values (
--     '${UNIQUE_ID}', '${CATEGORY}', '${HTTPS_IMAGE_URL}', ${SORT_ORDER},
--     '${LICENSE}', '${ATTRIBUTION_URL}', false, true
-- )
-- on conflict (id) do update
-- set image_url = excluded.image_url,
--     sort_order = excluded.sort_order,
--     license_name = excluded.license_name,
--     attribution_url = excluded.attribution_url,
--     is_active = excluded.is_active
-- returning *;
