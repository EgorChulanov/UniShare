-- Run only through a direct PostgreSQL admin connection, never from the app.
select * from public.admin_product_metrics;

select *
from public.admin_user_overview
order by created_at desc
limit 200;

select *
from public.admin_moderation_queue
where state in ('open', 'reviewing')
order by created_at asc
limit 200;

select key, value, is_public, description, updated_at
from public.app_config
order by key;

select cache_key, expires_at, updated_at
from public.game_catalog_cache
order by updated_at desc
limit 100;

select id, category, pattern, is_active, updated_at
from public.content_rules
order by category, id;

-- Negative IDs are reserved for entries managed directly by UniShare.
select * from public.game_catalog_overrides order by name;
