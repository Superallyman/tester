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
   (`init/001_schema.sql` builds the base schema automatically the first time, on an empty volume).
3. Point the app at it in `.env.local`:
   ```
   DATABASE_URL=postgresql://optotester:<password>@127.0.0.1:5433/optotester
   ```

4. Apply schema changes: `npm run db:migrate`. `npm run dev` also does this first, through the `predev` script,
   and so does the production container when it starts.

## Schema changes

Every change after the base schema is a file in `postgres/migrations/`, named `NNN_what_it_does.sql`. Don't edit a file
that has been applied; add a new one. `npm run db:migrate` applies pending files in name order, each in its own
transaction, and records them in `schema_migrations`. `npm run db:migrate -- --status` lists them.

A database that already had migrations applied by hand is marked with `npm run db:migrate -- --baseline 004`.
The dev database on optotester-dev was baselined this way on 2026-10-23.

## Tests

`npm test` runs `tests/e2e/*.mts` against the dev server on :3000 (override with `TEST_BASE_URL`) and the database in
`.env.local`. They create throwaway `claude-e2e*@e2e.invalid` accounts and remove them. Browser tests need Playwright's
Chromium; on optotester-dev `tests/run.sh` loads the unpacked system libraries from `~/.cache/optotester-pw`.
`npx tsx --env-file=.env.local tests/screenshots.mts` saves screenshots of the account pages to `tests/screenshots-out/`.

## Moving production off Supabase

Production still runs on Supabase and keeps adding rows. When it moves, run these steps in order on its new
database:

1. Start only the database: `docker compose up -d db`. It gets the base schema; don't run migrations yet.
2. Copy every row from Supabase: `./postgres/sync-from-supabase.sh`.
3. Check the copy: `./postgres/verify-against-supabase.sh` must print MATCH for every table.
4. Clean the data: `postgres/cutover/2026-10-data-cleanup.sql`. It removes the February 2026 test rows and the
   "anonymous" rows, renames the unused duplicate questions table to `questions_archive`, and converts the old 1-10
   confidence ratings to 1-4. It's safe to run twice.
5. Apply the migrations: `npm run db:migrate`, or start the app container (`docker compose up -d`), which runs them
   first. They come last because `002` creates an account for every email in the history, and `003`'s 1-4 rating
   check needs step 4.

The sync and verify scripts use `pg_dump` / `psql` from the host when installed, and otherwise run them in the
`postgres:17-alpine` image.

The dev database got step 4 on 2026-10-23, so it no longer matches Supabase and must not be synced again.

## Copying data from Supabase

`./postgres/sync-from-supabase.sh` replaces all local rows with a fresh `pg_dump` of the Supabase tables, in one
transaction, and prints row counts from both sides. It needs `SUPABASE_DB_HOST`, `SUPABASE_DB_USER` and
`SUPABASE_DB_PASSWORD` in `.env.local` (the IPv4 session pooler, since this VM has no IPv6).

`./postgres/verify-against-supabase.sh` compares row counts and checksums of every table on both sides and prints
MATCH or DIFFERENT. Run it right after a sync.

## Accounts and sign-in

`app_users` (`migrations/002_app_users.sql`) decides who can use the app. Each row can sign in with GitHub, with an
email + password, or both. History in `user_activity` is keyed by the account's email, so it's shared across
both methods.

- **GitHub**: the first GitHub sign-in links to the account whose email matches the verified GitHub email.
  After that, the GitHub login is what's matched.
- **Password**: an admin invites someone at `/admin/users`, which issues a temporary password that the user
  replaces at first sign-in. A GitHub user can add a password themselves at `/account`.
- `migrations/002_app_users.sql` created the table and an account for every email that already had history.
- Make someone an admin: `docker exec optotester-db psql -U optotester -d optotester -c "update app_users set is_admin = true where email = '<email>'"`
