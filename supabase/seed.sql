-- Admin-managed community stories. Safe to run repeatedly.
insert into public.stories (
    id, title, subtitle, body, symbol, accent_hex,
    cta_title, cta_url, priority, is_active, published_at
)
values
    (
        '10000000-0000-4000-8000-000000000001',
        'Безопасная игра',
        'Защищайте аккаунт при поиске тиммейтов',
        'Не отправляйте пароли, коды безопасности и платёжные данные. UniShare предназначен для поиска игроков и не поддерживает продажу или передачу аккаунтов.',
        'shield.checkered',
        'E94560',
        null,
        null,
        100,
        true,
        now()
    ),
    (
        '10000000-0000-4000-8000-000000000002',
        'Как работает мэтч',
        'Лайк превращается в чат только при взаимном интересе',
        'Листайте анкеты на главном экране. Если второй пользователь также выберет вашу анкету, UniShare автоматически создаст защищённый чат для обсуждения деталей.',
        'heart.fill',
        'F28C52',
        'Открыть главное',
        'unishare://feed',
        90,
        true,
        now()
    ),
    (
        '10000000-0000-4000-8000-000000000003',
        'Заполните профиль',
        'Игры и платформы улучшают рекомендации',
        'Добавьте платформы, любимые игры и навыки. Чем точнее анкета, тем релевантнее профили в ленте.',
        'person.crop.rectangle.stack.fill',
        '2F7CF6',
        'Редактировать профиль',
        'unishare://profile',
        80,
        true,
        now()
    )
on conflict (id) do update set
    title = excluded.title,
    subtitle = excluded.subtitle,
    body = excluded.body,
    symbol = excluded.symbol,
    accent_hex = excluded.accent_hex,
    cta_title = excluded.cta_title,
    cta_url = excluded.cta_url,
    priority = excluded.priority,
    is_active = excluded.is_active;
