#!/usr/bin/env bash
# Replaces the local Postgres data with a fresh copy from Supabase.
# Needs SUPABASE_DB_HOST / SUPABASE_DB_USER / SUPABASE_DB_PASSWORD in .env.local and POSTGRES_PASSWORD in .env.
set -euo pipefail
cd "$(dirname "$0")/.."

val() { grep "^$1=" "$2" | cut -d= -f2- | tr -d '"'; }
# pg_dump / psql from the host if installed, else from the Postgres image (host network, so 127.0.0.1 is this machine)
pg() { if command -v "$1" > /dev/null; then "$@"; else docker run --rm -i --network host -e PGPASSWORD postgres:17-alpine "$@"; fi; }
REMOTE="host=$(val SUPABASE_DB_HOST .env.local) port=5432 user=$(val SUPABASE_DB_USER .env.local) dbname=postgres sslmode=require"
LOCAL="host=127.0.0.1 port=$(val POSTGRES_PORT .env) user=optotester dbname=optotester"
TABLES=(-t public.questions -t 'public."questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep"' -t public.user_activity)
DUMP=$(mktemp)
trap 'rm -f "$DUMP"' EXIT

PGPASSWORD=$(val SUPABASE_DB_PASSWORD .env.local) pg pg_dump "$REMOTE" --data-only --no-owner --no-privileges "${TABLES[@]}" > "$DUMP"

# One transaction: either the whole refresh lands or the old data stays
{
  echo 'truncate user_activity, questions, "questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep";'
  cat "$DUMP"
} | PGPASSWORD=$(val POSTGRES_PASSWORD .env) pg psql "$LOCAL" -q -v ON_ERROR_STOP=1 --single-transaction -f - > /dev/null

COUNTS="select 'questions', count(*) from questions union all select 'user_activity', count(*) from user_activity"
echo "Supabase:"; PGPASSWORD=$(val SUPABASE_DB_PASSWORD .env.local) pg psql "$REMOTE" -Atc "$COUNTS"
echo "Local:";    PGPASSWORD=$(val POSTGRES_PASSWORD .env) pg psql "$LOCAL" -Atc "$COUNTS"
