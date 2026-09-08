create or replace function public.get_feed_profiles(kind text, batch_limit integer default 12)
returns setof public.users
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null then raise exception 'Authentication required'; end if;
    if kind not in ('exchange', 'skills') then raise exception 'Invalid request type'; end if;
    if batch_limit not between 1 and 30 then raise exception 'Invalid batch limit'; end if;

    return query
    select candidate.*
    from public.users candidate
    join public.users viewer on viewer.uid = auth.uid()
    where candidate.uid <> auth.uid()
      and candidate.onboarding_complete
      and candidate.account_state = 'active'
      and (kind = 'exchange' or candidate.has_skills_profile)
      and not public.is_blocked_pair(candidate.uid)
      and not exists (
          select 1 from public.swipe_decisions decision
          where decision.user_id = auth.uid()
            and decision.target_id = candidate.uid
            and decision.context = kind
            and (decision.decision = 'like' or decision.updated_at >= now() - interval '30 days')
      )
      and not exists (
          select 1 from public.chats chat
          where auth.uid() = any(chat.participants)
            and candidate.uid = any(chat.participants)
            and chat.chat_type = kind
      )
    order by (
        case when candidate.games && viewer.wanted_games then 8 else 0 end
        + case when candidate.wanted_games && viewer.games then 6 else 0 end
        + case when candidate.platforms && viewer.platforms then 2 else 0 end
        + case when exists (
            select 1
            from jsonb_array_elements(coalesce(candidate.subscriptions, '[]'::jsonb)) candidate_subscription
            join jsonb_array_elements(coalesce(viewer.subscriptions, '[]'::jsonb)) viewer_subscription
              on lower(candidate_subscription->>'name') = lower(viewer_subscription->>'name')
        ) then 3 else 0 end
    ) desc,
    random()
    limit batch_limit;
end;
$$;

revoke all on function public.get_feed_profiles(text, integer) from public, anon, authenticated;
grant execute on function public.get_feed_profiles(text, integer) to authenticated, service_role;
