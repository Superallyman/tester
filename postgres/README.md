# Local Postgres

The app's database runs in the `db` service of `docker-compose.yml` (Postgres 17, bound to `127.0.0.1:5433`).
The compose project is pinned to `optotester`, so master and the creative-mode worktree share the same container and volume.
Browsers never talk to it: pages call the Next.js routes in `app/api/*`, which check the next-auth session
and query Postgres through `server/db.ts`.

## Setup

1. Create `.env` next to `docker-compose.yml`:
   ```
   POSTGRES_PASSWORD=<long random string>
   POSTGRES_PORT=5433
   ```
2. Start the database: `docker compose up -d db`
   (`init/001_schema.sql` runs automatically the first time, on an empty volume).
3. Point the app at it in `.env.local`:
   ```
   DATABASE_URL=postgresql://optotester:<password>@127.0.0.1:5433/optotester
   ```

## Copying data from Supabase

`./postgres/sync-from-supabase.sh` replaces all local rows with a fresh `pg_dump` of the Supabase tables, in one
transaction, and prints row counts from both sides. It needs `SUPABASE_DB_HOST`, `SUPABASE_DB_USER` and
`SUPABASE_DB_PASSWORD` in `.env.local` (the IPv4 session pooler, since this VM has no IPv6).

`./postgres/verify-against-supabase.sh` compares row counts and checksums of every table on both sides and prints
MATCH or DIFFERENT. Run it right after a sync.

## Accounts and sign-in

`app_users` (`init/002_app_users.sql`) decides who can use the app. Each row can sign in with GitHub, with an
email + password, or both. History in `user_activity` is keyed by the account's email, so it's shared across
both methods.

- **GitHub**: the first GitHub sign-in links to the account whose email matches the verified GitHub email.
  After that, the GitHub login is what's matched.
- **Password**: an admin invites someone at `/admin/users`, which issues a temporary password that the user
  replaces at first sign-in. A GitHub user can add a password themselves at `/account`.
- To apply to an existing database: `docker exec -i optotester-db psql -U optotester -d optotester < postgres/init/002_app_users.sql`
  (it also creates accounts for every email that already has history).
- Make someone an admin: `docker exec optotester-db psql -U optotester -d optotester -c "update app_users set is_admin = true where email = '<email>'"`
