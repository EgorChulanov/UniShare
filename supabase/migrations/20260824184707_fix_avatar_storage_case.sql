-- Foundation renders UUID strings uppercase while auth.uid()::text is lowercase.
-- Normalize both sides so uploads and upserts remain owner-only on every client.
drop policy if exists avatar_upload_self on storage.objects;
drop policy if exists avatar_update_self on storage.objects;
drop policy if exists avatar_delete_self on storage.objects;

create policy avatar_upload_self
on storage.objects for insert
to authenticated
with check (
    bucket_id = 'avatars'
    and (
        lower((storage.foldername(name))[1]) = lower((select auth.uid())::text)
        or lower(name) = lower((select auth.uid())::text || '.jpg')
    )
);

create policy avatar_update_self
on storage.objects for update
to authenticated
using (
    bucket_id = 'avatars'
    and (
        lower((storage.foldername(name))[1]) = lower((select auth.uid())::text)
        or lower(name) = lower((select auth.uid())::text || '.jpg')
    )
)
with check (
    bucket_id = 'avatars'
    and (
        lower((storage.foldername(name))[1]) = lower((select auth.uid())::text)
        or lower(name) = lower((select auth.uid())::text || '.jpg')
    )
);

create policy avatar_delete_self
on storage.objects for delete
to authenticated
using (
    bucket_id = 'avatars'
    and (
        lower((storage.foldername(name))[1]) = lower((select auth.uid())::text)
        or lower(name) = lower((select auth.uid())::text || '.jpg')
    )
);
