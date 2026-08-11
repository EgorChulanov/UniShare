select s.id,
       s.title,
       s.is_active,
       s.priority,
       s.published_at,
       s.expires_at,
       count(v.user_id) as unique_views
from public.stories s
left join public.story_views v on v.story_id = s.id
group by s.id
order by s.priority desc, s.published_at desc;
