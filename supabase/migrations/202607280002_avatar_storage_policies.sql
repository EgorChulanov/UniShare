-- Safe to run repeatedly. Supports the current <uid>/avatar.jpg path and legacy <uid>.jpg objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatar_metadata_read on storage.objects;
drop policy if exists avatar_upload_self on storage.objects;
drop policy if exists avatar_update_self on storage.objects;
drop policy if exists avatar_delete_self on storage.objects;

create policy avatar_metadata_read
on storage.objects for select
to public
using (bucket_id = 'avatars');

create policy avatar_upload_self
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'avatars'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or name = auth.uid()::text || '.jpg'
    )
);

create policy avatar_update_self
on storage.objects for update
to authenticated
using (
    bucket_id = 'avatars'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or name = auth.uid()::text || '.jpg'
    )
)
with check (
    bucket_id = 'avatars'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or name = auth.uid()::text || '.jpg'
    )
);

create policy avatar_delete_self
on storage.objects for delete
to authenticated
using (
    bucket_id = 'avatars'
    and (
        (storage.foldername(name))[1] = auth.uid()::text
        or name = auth.uid()::text || '.jpg'
    )
);
