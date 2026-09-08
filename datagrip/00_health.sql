-- Безопасная проверка подключения. Этот файл ничего не изменяет.
select current_database() as "база_данных",
       current_user as "роль",
       current_setting('server_version') as "версия_postgresql",
       now() as "время_сервера";

select schemaname as "схема",
       tablename as "таблица",
       rowsecurity as "защита_rls_включена"
from pg_tables
where schemaname in ('public', 'storage')
order by schemaname, tablename;

select id as "хранилище",
       public as "публичное",
       file_size_limit as "лимит_байт",
       allowed_mime_types as "разрешённые_типы"
from storage.buckets
order by id;
