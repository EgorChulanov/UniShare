-- ОБЩАЯ ПАНЕЛЬ АДМИНИСТРАТОРА
-- Запускайте только через прямое подключение PostgreSQL в DataGrip.
-- Мобильное приложение не должно выполнять эти запросы.

-- Общие показатели приложения.
select * from public.admin_product_metrics;

-- Пользователи, состояние аккаунтов и активность.
select *
from public.admin_user_overview
order by created_at desc
limit 200;

-- Жалобы, которые ещё требуют решения.
select *
from public.admin_moderation_queue
where state in ('open', 'reviewing')
order by created_at asc
limit 200;

-- Настройки приложения. Секретные значения не должны быть публичными.
select key as "ключ",
       value as "значение",
       is_public as "доступно_приложению",
       description as "описание",
       updated_at as "обновлено"
from public.app_config
order by key;

-- Кэш результатов поиска игр.
select cache_key as "ключ_кэша",
       expires_at as "истекает",
       updated_at as "обновлено"
from public.game_catalog_cache
order by updated_at desc
limit 100;

-- Правила автоматической проверки контента.
select id,
       category as "категория",
       pattern as "шаблон",
       is_active as "активно",
       updated_at as "обновлено"
from public.content_rules
order by category, id;

-- Игры, добавленные вручную. Отрицательные id зарезервированы для UniShare.
select * from public.game_catalog_overrides order by name;
