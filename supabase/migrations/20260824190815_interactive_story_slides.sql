alter table public.stories
add column if not exists slides jsonb not null default '[]'::jsonb;

alter table public.stories
drop constraint if exists stories_slides_array_check;
alter table public.stories
add constraint stories_slides_array_check check (jsonb_typeof(slides) = 'array');

update public.stories
set title = 'Правила сообщества',
    subtitle = 'Уважение, безопасность и честный обмен',
    body = 'Короткие правила, которые защищают участников UniShare.',
    image_url = 'asset:Story-rules',
    symbol = 'checklist',
    accent_hex = 'FF7657',
    cta_title = 'Полные правила',
    cta_url = 'https://telegra.ph/Pravila-soobshchestva-NS-Share-02-19-2',
    slides = jsonb_build_array(
        jsonb_build_object(
            'title', 'Общайтесь уважительно',
            'subtitle', 'Без оскорблений, агрессии и контента 18+',
            'body', 'Не публикуйте рекламу, флуд, политические материалы и чужие персональные данные. Жалуйтесь на нарушение через меню профиля.',
            'image_url', 'asset:Story-rules',
            'symbol', 'message.badge.shield.checkmark.fill'
        ),
        jsonb_build_object(
            'title', 'Только бесплатный обмен',
            'subtitle', 'Продажи и попрошайничество запрещены',
            'body', 'UniShare помогает людям находить партнёров для взаимного доступа к игровым библиотекам. Не переводите деньги незнакомым пользователям.',
            'image_url', 'asset:Story-rules',
            'symbol', 'arrow.left.arrow.right.circle.fill'
        ),
        jsonb_build_object(
            'title', 'Берегите чужой аккаунт',
            'subtitle', 'Не меняйте данные и не тратьте чужой баланс',
            'body', 'Запускайте игры со своего профиля, не вмешивайтесь в прогресс владельца и сразу отзывайте доступ, если договорённость закончилась.',
            'image_url', 'asset:Story-safety',
            'symbol', 'lock.shield.fill'
        )
    )
where id = '10000000-0000-4000-8000-000000000001';

update public.stories
set title = 'Безопасный вход по QR',
    subtitle = 'Не отправляйте пароль в переписке',
    body = 'Используйте официальные способы входа и передачи доступа, если правила платформы это разрешают.',
    image_url = 'asset:Story-qr',
    symbol = 'qrcode.viewfinder',
    accent_hex = '21B6E8',
    cta_title = 'Открыть инструкцию',
    cta_url = 'https://telegra.ph/Obmen-akkauntami-cherez-QR-kody-02-18',
    slides = jsonb_build_array(
        jsonb_build_object(
            'title', 'Пароль остаётся у владельца',
            'subtitle', 'Используйте QR или одноразовый код',
            'body', 'Никогда не отправляйте пароль, резервные коды, данные карты или коды двухфакторной защиты в чат.',
            'image_url', 'asset:Story-qr',
            'symbol', 'qrcode.viewfinder'
        ),
        jsonb_build_object(
            'title', 'Проверьте защиту аккаунта',
            'subtitle', 'Включите 2FA и проверьте активные сессии',
            'body', 'Перед обменом обновите способы восстановления. После завершения проверьте список устройств и отзовите ненужные подключения.',
            'image_url', 'asset:Story-safety',
            'symbol', 'person.badge.shield.checkmark.fill'
        ),
        jsonb_build_object(
            'title', 'Следуйте правилам платформы',
            'subtitle', 'Возможности и ограничения могут меняться',
            'body', 'Проверяйте актуальные условия Nintendo, PlayStation, Xbox, Steam и других сервисов перед каждым обменом.',
            'image_url', 'asset:Story-qr',
            'symbol', 'checkmark.seal.fill'
        )
    )
where id = '10000000-0000-4000-8000-000000000002';

update public.stories
set title = 'Как работает лента',
    subtitle = 'Сначала подходящие анкеты, затем новые люди',
    body = 'Рекомендации учитывают игры, платформы и подписки, но сохраняют случайное знакомство.',
    image_url = 'asset:Story-safety',
    symbol = 'rectangle.stack.person.crop.fill',
    accent_hex = '2F7CF6',
    cta_title = 'Заполнить профиль',
    cta_url = 'unishare://profile',
    slides = jsonb_build_array(
        jsonb_build_object(
            'title', 'Укажите, что у вас есть',
            'subtitle', 'Игры, платформы и активные подписки',
            'body', 'Полная анкета помогает другому человеку понять предложение без лишних сообщений.',
            'image_url', 'asset:Story-safety',
            'symbol', 'gamecontroller.fill'
        ),
        jsonb_build_object(
            'title', 'Добавьте, что хотите получить',
            'subtitle', 'Лента поднимет подходящие профили выше',
            'body', 'Совпадение не ограничивает выбор: после подходящих анкет приложение продолжит показывать случайных участников.',
            'image_url', 'asset:Story-safety',
            'symbol', 'scope'
        ),
        jsonb_build_object(
            'title', 'Взаимный интерес создаёт чат',
            'subtitle', 'Заявка исчезает сразу после принятия',
            'body', 'Откройте профиль собеседника из шапки чата, изучите его игры и договоритесь о безопасном способе взаимодействия.',
            'image_url', 'asset:Story-rules',
            'symbol', 'bubble.left.and.bubble.right.fill'
        )
    )
where id = '10000000-0000-4000-8000-000000000003';
