-- Последние 200 профилей. Запрос только читает данные.
select uid as "id_пользователя",
       username as "имя",
       account_state as "состояние_аккаунта",
       onboarding_complete as "анкета_заполнена",
       is_online as "сейчас_в_сети",
       last_seen as "последняя_активность",
       created_at as "дата_регистрации"
from public.users
order by created_at desc
limit 200;

-- Количество пользователей по состоянию аккаунта.
select account_state as "состояние_аккаунта",
       count(*) as "пользователей"
from public.users
group by account_state
order by account_state;
