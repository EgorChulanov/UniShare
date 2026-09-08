create or replace function public.search_profiles(
    search_text text,
    result_limit integer default 30
)
returns setof public.users
language sql
stable
security invoker
set search_path = ''
as $$
    select u.*
    from public.users as u
    where u.uid <> (select auth.uid())
      and u.onboarding_complete
      and u.account_state = 'active'
      and char_length(trim(search_text)) between 2 and 80
      and concat_ws(
            ' ',
            u.username::text,
            coalesce(u.status, ''),
            array_to_string(u.games, ' '),
            array_to_string(u.wanted_games, ' '),
            array_to_string(u.platforms, ' '),
            array_to_string(u.skills, ' '),
            u.platform_games::text,
            u.subscriptions::text
          ) ilike '%' || replace(replace(trim(search_text), '%', '\\%'), '_', '\\_') || '%'
    order by
      case when u.username::text ilike trim(search_text) || '%' then 0 else 1 end,
      u.rating desc,
      u.updated_at desc
    limit least(greatest(result_limit, 1), 50);
$$;

revoke all on function public.search_profiles(text, integer) from public;
grant execute on function public.search_profiles(text, integer) to authenticated;

comment on function public.search_profiles(text, integer) is
    'Searches only RLS-visible active profiles across public profile fields.';
