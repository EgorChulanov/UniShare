-- Admin panel: admins, bans, in-app bug reports and an audit log of every
-- moderator action. account_state already exists (active | suspended | banned):
-- sessions of non-active users are rejected and every list filters them out.

alter table users
    add column is_admin boolean not null default false,
    add column ban_reason text check (ban_reason is null or char_length(ban_reason) <= 500),
    add column banned_at timestamptz;

create index users_admins_idx on users (uid) where is_admin;
create index users_restricted_idx on users (account_state, banned_at desc) where account_state <> 'active';
create index users_created_idx on users (created_at desc);

-- How an admin closed a user report.
alter table reports
    add column admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
    add column handled_by uuid references users(uid) on delete set null;

create index reports_subject_idx on reports (subject_id, created_at desc);

create table bug_reports (
    id uuid primary key default gen_random_uuid(),
    -- set null, not cascade: a bug report is feedback about the app, not about the
    -- person, and stays useful after they delete their account; it just stops
    -- pointing at them.
    user_id uuid references users(uid) on delete set null,
    text text not null check (char_length(text) between 5 and 2000),
    -- Client, platform, app version, url, user agent, screen size, language (capped by the API).
    context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 4096),
    -- Storage key of an optional screenshot (bugs/<id>.<ext>), served to admins only through signed URLs.
    screenshot_key text check (screenshot_key is null or screenshot_key ~ '^bugs/[A-Za-z0-9_.-]+$'),
    state text not null default 'open' check (state in ('open', 'resolved', 'rejected')),
    admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create index bug_reports_state_idx on bug_reports (state, created_at desc);
create index bug_reports_user_created_idx on bug_reports (user_id, created_at desc);

-- Audit log. Usernames are copied at write time so entries stay readable after
-- an account is deleted (the references then become null).
create table admin_actions (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid references users(uid) on delete set null,
    admin_username text,
    target_user_id uuid references users(uid) on delete set null,
    target_username text,
    report_id uuid references reports(id) on delete set null,
    bug_id uuid references bug_reports(id) on delete set null,
    action text not null check (action in (
        'claim_admin', 'grant_admin', 'revoke_admin',
        'ban', 'suspend', 'unban',
        'report_resolve', 'report_reject', 'report_reopen',
        'bug_resolve', 'bug_reject', 'bug_reopen'
    )),
    reason text check (reason is null or char_length(reason) <= 1000),
    details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
    created_at timestamptz not null default now()
);

create index admin_actions_created_idx on admin_actions (created_at desc);
create index admin_actions_target_idx on admin_actions (target_user_id, created_at desc);

-- ── Read-only views for operators (DataGrip / psql) ─────────────────────────

-- New columns go last: create or replace view cannot reorder existing ones.
create or replace view admin_overview as
select
    (select count(*) from users) as users_total,
    (select count(*) from users where onboarding_complete) as users_onboarded,
    (select count(*) from users where last_seen > now() - interval '1 day') as users_active_24h,
    (select count(*) from user_identities where provider = 'telegram') as telegram_identities,
    (select count(*) from user_identities where provider = 'vk') as vk_identities,
    (select count(*) from chats) as chats_total,
    (select count(*) from messages where created_at > now() - interval '1 day') as messages_24h,
    (select count(*) from reports where state = 'open') as reports_open,
    (select count(*) from bug_reports where state = 'open') as bugs_open,
    (select count(*) from users where account_state = 'banned') as users_banned,
    (select count(*) from users where account_state = 'suspended') as users_suspended,
    (select count(*) from users where created_at > now() - interval '1 day') as users_new_24h;

create view admin_report_inbox as
select r.id, r.created_at, r.state, r.reason, r.details,
       reporter.username as reporter, subject.username as subject, subject.account_state as subject_state,
       (select count(*) from reports x where x.subject_id = r.subject_id) as subject_reports,
       r.subject_id, r.reporter_id
from reports r
left join users reporter on reporter.uid = r.reporter_id
left join users subject on subject.uid = r.subject_id
order by (r.state in ('open', 'reviewing')) desc, r.created_at desc;

create view admin_bug_inbox as
select b.id, b.created_at, b.state, u.username, b.text,
       b.context ->> 'client' as client, b.context ->> 'platform' as platform, b.context ->> 'appVersion' as app_version,
       b.screenshot_key is not null as has_screenshot, b.admin_note, b.user_id
from bug_reports b
left join users u on u.uid = b.user_id
order by (b.state = 'open') desc, b.created_at desc;

create view admin_restricted_users as
select u.uid, u.username, u.account_state, u.ban_reason, u.banned_at, u.created_at, u.last_seen,
       (select count(*) from reports r where r.subject_id = u.uid) as reports_against
from users u
where u.account_state <> 'active'
order by u.banned_at desc nulls last;
