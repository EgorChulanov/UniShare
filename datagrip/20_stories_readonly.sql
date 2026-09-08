-- Все истории и количество уникальных просмотров. Запрос безопасен.
select s.id,
       s.title as "заголовок",
       s.is_active as "активна",
       s.priority as "приоритет",
       s.published_at as "дата_публикации",
       s.expires_at as "скрыть_после",
       count(v.user_id) as "уникальных_просмотров"
from public.stories s
left join public.story_views v on v.story_id = s.id
group by s.id
order by s.priority desc, s.published_at desc;
