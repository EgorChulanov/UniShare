alter table public.users
add column if not exists skills_portfolio_urls text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'skills-portfolio',
    'skills-portfolio',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists skills_portfolio_read on storage.objects;
drop policy if exists skills_portfolio_insert_self on storage.objects;
drop policy if exists skills_portfolio_update_self on storage.objects;
drop policy if exists skills_portfolio_delete_self on storage.objects;

create policy skills_portfolio_read
on storage.objects for select
to authenticated
using (bucket_id = 'skills-portfolio');

create policy skills_portfolio_insert_self
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'skills-portfolio'
    and lower((storage.foldername(name))[1]) = lower((select auth.uid())::text)
);

create policy skills_portfolio_update_self
on storage.objects for update
to authenticated
using (
    bucket_id = 'skills-portfolio'
    and lower((storage.foldername(name))[1]) = lower((select auth.uid())::text)
)
with check (
    bucket_id = 'skills-portfolio'
    and lower((storage.foldername(name))[1]) = lower((select auth.uid())::text)
);

create policy skills_portfolio_delete_self
on storage.objects for delete
to authenticated
using (
    bucket_id = 'skills-portfolio'
    and lower((storage.foldername(name))[1]) = lower((select auth.uid())::text)
);
