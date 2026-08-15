select uid,
       username,
       account_state,
       onboarding_complete,
       is_online,
       last_seen,
       created_at
from public.users
order by created_at desc
limit 200;

select account_state, count(*) as users
from public.users
group by account_state
order by account_state;
