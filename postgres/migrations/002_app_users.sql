-- Accounts: who may use the app and how they sign in. Replaces the GitHub display-name allowlist.
-- Everything per-user (user_activity.user_email) is keyed by email, so an account keeps its history
-- whichever way its owner signs in: GitHub (matched on the verified email or the GitHub login) or a password.

create table if not exists app_users (
    id uuid default gen_random_uuid() not null primary key,
    email text not null unique check (email = lower(email)),
    name text not null,
    password_hash text,                -- null: no password login (GitHub only)
    github_login text unique,          -- recorded on first GitHub sign-in, stored lower-case
    is_admin boolean not null default false,
    disabled boolean not null default false,
    must_change_password boolean not null default false,
    created_at timestamptz not null default now(),
    last_login_at timestamptz
);

-- Everyone who already has history was let in by the old allowlist, so they keep access
insert into app_users (email, name)
select distinct on (lower(trim(user_email))) lower(trim(user_email)), split_part(lower(trim(user_email)), '@', 1)
from user_activity
where user_email like '%_@_%'
on conflict (email) do nothing;
