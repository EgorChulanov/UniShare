-- Admin-managed community stories. Safe to run repeatedly.
insert into public.stories (
    id, title, subtitle, body, symbol, accent_hex,
    cta_title, cta_url, priority, is_active, published_at
)
values
    (
        '10000000-0000-4000-8000-000000000001',
        'Play Safely',
        'Protect your account while meeting other players',
        'Never send passwords, recovery codes, verification codes, or payment details. UniShare supports discovery and communication, not credential or account transfers.',
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
        'How Matching Works',
        'A like becomes a chat only after mutual interest',
        'Browse profiles in the feed. When both people like each other, UniShare creates a private chat for the conversation.',
        'heart.fill',
        'F28C52',
        'Open Feed',
        'unishare://feed',
        90,
        true,
        now()
    ),
    (
        '10000000-0000-4000-8000-000000000003',
        'Complete Your Profile',
        'Games and platforms improve recommendations',
        'Add your platforms, favorite games, and skills. A more complete profile produces more relevant recommendations.',
        'person.crop.rectangle.stack.fill',
        '2F7CF6',
        'Edit Profile',
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
