#!/usr/bin/env bash
# Compares every table (row count + md5 of all rows) between Supabase and the local Postgres.
# Same credentials as sync-from-supabase.sh. Exits non-zero if anything differs.
set -euo pipefail
cd "$(dirname "$0")/.."

val() { grep "^$1=" "$2" | cut -d= -f2- | tr -d '"'; }
REMOTE="host=$(val SUPABASE_DB_HOST .env.local) port=5432 user=$(val SUPABASE_DB_USER .env.local) dbname=postgres sslmode=require"
LOCAL="host=127.0.0.1 port=$(val POSTGRES_PORT .env) user=optotester dbname=optotester"
Q="select 'questions', count(*), md5(string_agg(t::text, '|' order by t.id::text)) from questions t
   union all select 'questions_duplicate', count(*), md5(string_agg(t::text, '|' order by t.id::text)) from \"questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep\" t
   union all select 'user_activity', count(*), md5(string_agg(t::text, '|' order by t.id)) from user_activity t"

R=$(PGPASSWORD=$(val SUPABASE_DB_PASSWORD .env.local) psql "$REMOTE" -AtF' ' -c "$Q")
L=$(PGPASSWORD=$(val POSTGRES_PASSWORD .env) psql "$LOCAL" -AtF' ' -c "$Q")
echo "Supabase:"; echo "$R"
echo "Local:";    echo "$L"
if [ "$R" = "$L" ]; then echo "MATCH: local Postgres is identical to Supabase"; else echo "DIFFERENT" >&2; exit 1; fi
