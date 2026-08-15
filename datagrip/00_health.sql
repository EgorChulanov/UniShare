select current_database() as database,
       current_user as role,
       current_setting('server_version') as postgres_version,
       now() as server_time;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname in ('public', 'storage')
order by schemaname, tablename;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;
