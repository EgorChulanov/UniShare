-- Steam library import: a Steam account can be linked to a UniShare account
-- through Steam sign-in (OpenID 2.0). It is never a way to sign in to UniShare;
-- it only lets the server read the owned games list.

-- The provider check is inline in 001_init.sql, so PostgreSQL named it
-- user_identities_provider_check; look it up anyway in case it was renamed.
do $$
declare
    name text;
begin
    for name in
        select conname from pg_constraint
        where conrelid = 'user_identities'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) like '%provider%'
          and pg_get_constraintdef(oid) not like '%provider_user_id%'
    loop
        execute format('alter table user_identities drop constraint %I', name);
    end loop;
end $$;

alter table user_identities
    add constraint user_identities_provider_check check (provider in ('telegram', 'vk', 'dev', 'steam'));

-- One-time states of "Sign in through Steam": the token travels in openid.return_to
-- and comes back with Steam's answer. Single use, valid for 15 minutes.
create table steam_login_states (
    token_hash text primary key,
    user_id uuid not null references users(uid) on delete cascade,
    -- Client that started the sign-in; the result page links back to it.
    client text not null check (client in ('telegram', 'vk', 'web')),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index steam_login_states_user_idx on steam_login_states (user_id, created_at desc);
create index steam_login_states_expiry_idx on steam_login_states (expires_at);
