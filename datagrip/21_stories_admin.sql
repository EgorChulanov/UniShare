-- UniShare story administration. Attach this file to UniShare Production.
-- The first query is always safe and shows the current publication state.
select s.id,
       s.title,
       s.subtitle,
       s.image_url,
       s.symbol,
       s.accent_hex,
       s.cta_title,
       s.cta_url,
       s.priority,
       s.is_active,
       s.published_at,
       s.expires_at,
       count(v.user_id) as unique_views
from public.stories s
left join public.story_views v on v.story_id = s.id
group by s.id
order by s.priority desc, s.published_at desc;

-- CREATE: select only this statement and run it. DataGrip asks for each value.
-- insert into public.stories (
--     title, subtitle, body, image_url, symbol, accent_hex,
--     cta_title, cta_url, priority, is_active, published_at, expires_at
-- ) values (
--     '${TITLE}', '${SUBTITLE}', '${BODY}', nullif('${IMAGE_URL}', ''),
--     '${SF_SYMBOL}', '${ACCENT_HEX}', nullif('${CTA_TITLE}', ''),
--     nullif('${CTA_URL}', ''), ${PRIORITY}, true, now(),
--     nullif('${EXPIRES_AT_ISO8601}', '')::timestamptz
-- ) returning *;

-- UPDATE: replace STORY_ID, select this statement, then run it.
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

-- ARCHIVE keeps analytics and hides the story from the app.
-- update public.stories set is_active = false where id = 'STORY_ID'::uuid returning *;

-- REPUBLISH an archived story immediately.
-- update public.stories
-- set is_active = true, published_at = now(), expires_at = null
-- where id = 'STORY_ID'::uuid
-- returning *;

-- PERMANENT DELETE also removes view analytics. Prefer ARCHIVE.
-- delete from public.stories where id = 'STORY_ID'::uuid returning *;
