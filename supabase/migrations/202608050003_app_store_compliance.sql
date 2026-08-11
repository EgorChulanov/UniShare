-- Remove legacy account-sharing metadata and make the public experience a
-- teammate discovery service. Internal `exchange` identifiers remain for
-- backward compatibility with installed clients and existing chat rows.

update public.users
set subscriptions = coalesce((
    select jsonb_agg(item - 'url' - 'details' - 'shared_slots')
    from jsonb_array_elements(subscriptions) as item
), '[]'::jsonb)
where subscriptions <> '[]'::jsonb;

create or replace function public.sanitize_subscription_metadata(payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
    select coalesce(jsonb_agg(item - 'url' - 'details' - 'shared_slots'), '[]'::jsonb)
    from jsonb_array_elements(coalesce(payload, '[]'::jsonb)) as item
$$;

create or replace function public.sanitize_profile_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.subscriptions := public.sanitize_subscription_metadata(new.subscriptions);
    return new;
end;
$$;

drop trigger if exists users_sanitize_subscription_metadata on public.users;
create trigger users_sanitize_subscription_metadata
before insert or update of subscriptions on public.users
for each row execute function public.sanitize_profile_subscriptions();

revoke all on function public.sanitize_subscription_metadata(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.sanitize_profile_subscriptions() from public, anon, authenticated, service_role;

insert into public.content_rules (category, pattern) values
    ('credentials', '((sell|trade|transfer|share)[[:space:][:punct:]]{1,12}(my[[:space:]])?((steam|epic|playstation|xbox|nintendo)[[:space:]])?account)'),
    ('credentials', '((продам|обменяю|передам|дам[[:space:]]доступ).{0,24}(аккаунт|акк))')
on conflict (pattern) do update set is_active = true;

update public.stories
set title = 'Безопасная игра',
    subtitle = 'Защищайте аккаунт при поиске тиммейтов',
    body = 'Не отправляйте пароли, коды безопасности и платёжные данные. UniShare предназначен для поиска игроков и не поддерживает продажу или передачу аккаунтов.'
where id = '10000000-0000-4000-8000-000000000001';

update public.stories
set body = 'Добавьте платформы, любимые игры и навыки. Чем точнее анкета, тем релевантнее профили в ленте.'
where id = '10000000-0000-4000-8000-000000000003';
