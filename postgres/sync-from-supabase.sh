#!/usr/bin/env bash
# Replaces the local Postgres data with a fresh copy from Supabase.
# Needs SUPABASE_DB_HOST / SUPABASE_DB_USER / SUPABASE_DB_PASSWORD in .env.local and POSTGRES_PASSWORD in .env.
set -euo pipefail
cd "$(dirname "$0")/.."

val() { grep "^$1=" "$2" | cut -d= -f2- | tr -d '"'; }
REMOTE="host=$(val SUPABASE_DB_HOST .env.local) port=5432 user=$(val SUPABASE_DB_USER .env.local) dbname=postgres sslmode=require"
LOCAL="host=127.0.0.1 port=$(val POSTGRES_PORT .env) user=optotester dbname=optotester"
TABLES=(-t public.questions -t 'public."questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep"' -t public.user_activity)
DUMP=$(mktemp)
trap 'rm -f "$DUMP"' EXIT

PGPASSWORD=$(val SUPABASE_DB_PASSWORD .env.local) pg_dump "$REMOTE" --data-only --no-owner --no-privileges "${TABLES[@]}" -f "$DUMP"

# One transaction: either the whole refresh lands or the old data stays
{
  echo 'truncate user_activity, questions, "questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep";'
  cat "$DUMP"
} | PGPASSWORD=$(val POSTGRES_PASSWORD .env) psql "$LOCAL" -q -v ON_ERROR_STOP=1 --single-transaction -f - > /dev/null

COUNTS="select 'questions', count(*) from questions union all select 'user_activity', count(*) from user_activity"
echo "Supabase:"; PGPASSWORD=$(val SUPABASE_DB_PASSWORD .env.local) psql "$REMOTE" -Atc "$COUNTS"
echo "Local:";    PGPASSWORD=$(val POSTGRES_PASSWORD .env) psql "$LOCAL" -Atc "$COUNTS"
