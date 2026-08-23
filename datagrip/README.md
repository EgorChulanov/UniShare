# UniShare DataGrip workspace

Open this directory as a DataGrip project. Create a PostgreSQL data source named
`UniShare Production` from the values shown in Supabase Dashboard -> Connect ->
Session pooler.

- Database: `postgres`
- Port: `5432`
- User: `postgres.kwonpzkzthprilrhncik` for the shared pooler (copy the exact value from Connect)
- SSL mode: `require`
- Schemas to introspect: `public`, `auth`, `storage`
- Password: the database password from Supabase; store it only in DataGrip Password Safe

Do not use the publishable key as the database password. Do not put the database
password, service-role key, or connection URI in this repository.

`UniShare Local` is already defined for `127.0.0.1:54322`. Start it with
`make backend-start`, then enter the local development password `postgres` once
in DataGrip Password Safe. Local data is isolated from production and can be
reset safely with `make backend-reset`.

Attach the SQL files in this directory to `UniShare Production` before running
them. Start with `00_health.sql`.

Administrative consoles:

- `21_stories_admin.sql`: list, create, edit, archive, republish and delete stories.
- `50_game_catalog_admin.sql`: rotate the encrypted RAWG key, clear cache and
  maintain curated game covers. DataGrip parameters are prompted only when you
  run one of the commented mutation templates.

The RAWG key is stored in Supabase Vault, not `app_config`. Never put provider
keys into a public table, the iOS target, or Git. The `game-search` Edge Function
reads it through a server-only RPC and keeps the existing Edge Function secret
as a fallback during rollout.
