-- УПРАВЛЕНИЕ ИСТОРИЯМИ UNISHARE
-- Подключение: «UniShare — удалённая база».
--
-- Фото сначала загрузите через Supabase Dashboard:
-- Storage -> story-media -> Upload file -> Copy URL.
-- Затем вставьте скопированную ссылку в параметр IMAGE_URL блока «СОЗДАТЬ».
-- Подробная пошаговая инструкция находится в README.md.
--
-- Первый запрос безопасен: он только показывает текущее состояние историй.
select s.id,
       s.title as "заголовок",
       s.subtitle as "подзаголовок",
       s.image_url as "ссылка_на_фото",
       jsonb_array_length(s.slides) as "слайдов",
       s.symbol as "системная_иконка",
       s.accent_hex as "цвет_hex",
       s.cta_title as "текст_кнопки",
       s.cta_url as "ссылка_кнопки",
       s.priority as "приоритет",
       s.is_active as "активна",
       s.published_at as "дата_публикации",
       s.expires_at as "скрыть_после",
       count(v.user_id) as "уникальных_просмотров"
from public.stories s
left join public.story_views v on v.story_id = s.id
group by s.id
order by s.priority desc, s.published_at desc;

-- ПРОВЕРИТЬ ССЫЛКУ НА ФОТО
-- 1. Снимите комментарий только с запроса ниже.
-- 2. Запустите его и вставьте скопированный Public URL.
-- 3. Результат должен быть «Ссылка выглядит правильно».
-- select case
--     when '${IMAGE_URL}' like
--          'https://kwonpzkzthprilrhncik.supabase.co/storage/v1/object/public/story-media/%'
--         then 'Ссылка выглядит правильно'
--     else 'Ошибка: скопируйте Public URL файла из хранилища story-media'
-- end as "проверка_ссылки";

-- СОЗДАТЬ НОВУЮ ИСТОРИЮ
-- Выделите только этот блок и нажмите Run. DataGrip спросит значения:
-- TITLE              заголовок, максимум 64 символа;
-- SUBTITLE           короткий подзаголовок, максимум 120 символов;
-- BODY               полный текст, максимум 3000 символов;
-- IMAGE_URL          Public URL из story-media, либо пустая строка;
-- SF_SYMBOL          системная иконка Apple, например shield.fill;
-- ACCENT_HEX         цвет без #, например 4F8CFF;
-- CTA_TITLE / URL    необязательная кнопка и её ссылка;
-- PRIORITY           целое число: чем больше, тем раньше история;
-- EXPIRES_AT         дата ISO 8601, например 2026-09-30T21:00:00+03:00,
--                    либо пустая строка, чтобы не скрывать автоматически.
-- insert into public.stories (
--     title, subtitle, body, image_url, symbol, accent_hex,
--     cta_title, cta_url, priority, is_active, published_at, expires_at
-- ) values (
--     '${TITLE}', '${SUBTITLE}', '${BODY}', nullif('${IMAGE_URL}', ''),
--     '${SF_SYMBOL}', '${ACCENT_HEX}', nullif('${CTA_TITLE}', ''),
--     nullif('${CTA_URL}', ''), ${PRIORITY}, true, now(),
--     nullif('${EXPIRES_AT_ISO8601}', '')::timestamptz
-- ) returning *;

-- ДОБАВИТЬ ИЛИ ЗАМЕНИТЬ СЛАЙДЫ ИСТОРИИ
-- STORY_SLIDES_JSON — JSON-массив. Каждый элемент содержит title, subtitle,
-- body, image_url и symbol. Пример находится в docs/DATAGRIP_OPERATIONS.md.
-- update public.stories
-- set slides = '${STORY_SLIDES_JSON}'::jsonb
-- where id = '${STORY_ID}'::uuid
-- returning id, title, jsonb_pretty(slides);

-- ИЗМЕНИТЬ СУЩЕСТВУЮЩУЮ ИСТОРИЮ
-- Скопируйте id из первого запроса, вставьте вместо STORY_ID,
-- выделите только этот блок и запустите его.
-- update public.stories
-- set title = '${TITLE}',
--     subtitle = '${SUBTITLE}',
--     body = '${BODY}',
--     image_url = nullif('${IMAGE_URL}', ''),
--     symbol = '${SF_SYMBOL}',
--     accent_hex = '${ACCENT_HEX}',
--     cta_title = nullif('${CTA_TITLE}', ''),
--     cta_url = nullif('${CTA_URL}', ''),
--     priority = ${PRIORITY},
--     expires_at = nullif('${EXPIRES_AT_ISO8601}', '')::timestamptz
-- where id = 'STORY_ID'::uuid
-- returning *;

-- СКРЫТЬ ИСТОРИЮ, НО СОХРАНИТЬ СТАТИСТИКУ
-- Замените STORY_ID, затем выделите и запустите только эту строку.
-- update public.stories set is_active = false where id = 'STORY_ID'::uuid returning *;

-- СНОВА ОПУБЛИКОВАТЬ СКРЫТУЮ ИСТОРИЮ
-- update public.stories
-- set is_active = true, published_at = now(), expires_at = null
-- where id = 'STORY_ID'::uuid
-- returning *;

-- УДАЛИТЬ НАВСЕГДА
-- Удалится и статистика просмотров. Обычно безопаснее использовать «СКРЫТЬ».
-- delete from public.stories where id = 'STORY_ID'::uuid returning *;
