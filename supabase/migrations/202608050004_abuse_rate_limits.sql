-- Per-user write limits protect chats and moderation queues from automated abuse.

create index if not exists messages_sender_created_idx
on public.messages (sender_id, created_at desc);
create index if not exists like_requests_sender_created_idx
on public.like_requests (from_uid, created_at desc);
create index if not exists reports_reporter_created_idx
on public.reports (reporter_id, created_at desc);
create index if not exists reviews_author_created_idx
on public.reviews (from_uid, created_at desc);

create or replace function public.enforce_user_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    caller uuid := auth.uid();
    recent_count integer;
begin
    if caller is null then raise exception 'Authentication required'; end if;

    if tg_table_name = 'messages' then
        if new.sender_id <> caller then raise exception 'Invalid message sender'; end if;
        select count(*) into recent_count from public.messages
        where sender_id = caller and created_at >= now() - interval '1 minute';
        if recent_count >= 30 then raise exception 'Message rate limit exceeded'; end if;
    elsif tg_table_name = 'like_requests' then
        if new.from_uid <> caller then raise exception 'Invalid request sender'; end if;
        select count(*) into recent_count from public.like_requests
        where from_uid = caller and created_at >= now() - interval '1 minute';
        if recent_count >= 40 then raise exception 'Like rate limit exceeded'; end if;
    elsif tg_table_name = 'reports' then
        if new.reporter_id <> caller then raise exception 'Invalid reporter'; end if;
        select count(*) into recent_count from public.reports
        where reporter_id = caller and created_at >= now() - interval '1 hour';
        if recent_count >= 5 then raise exception 'Report rate limit exceeded'; end if;
    elsif tg_table_name = 'reviews' then
        if new.from_uid <> caller then raise exception 'Invalid review author'; end if;
        select count(*) into recent_count from public.reviews
        where from_uid = caller and created_at >= now() - interval '1 hour';
        if recent_count >= 10 then raise exception 'Review rate limit exceeded'; end if;
    end if;
    return new;
end;
$$;

drop trigger if exists messages_enforce_rate_limit on public.messages;
create trigger messages_enforce_rate_limit before insert on public.messages
for each row execute function public.enforce_user_write_rate_limit();
drop trigger if exists like_requests_enforce_rate_limit on public.like_requests;
create trigger like_requests_enforce_rate_limit before insert on public.like_requests
for each row execute function public.enforce_user_write_rate_limit();
drop trigger if exists reports_enforce_rate_limit on public.reports;
create trigger reports_enforce_rate_limit before insert on public.reports
for each row execute function public.enforce_user_write_rate_limit();
drop trigger if exists reviews_enforce_rate_limit on public.reviews;
create trigger reviews_enforce_rate_limit before insert on public.reviews
for each row execute function public.enforce_user_write_rate_limit();

revoke all on function public.enforce_user_write_rate_limit() from public, anon, authenticated, service_role;
