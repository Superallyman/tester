#!/usr/bin/env bash
# Compares every table (row count + md5 of all rows) between Supabase and the local Postgres.
# Same credentials as sync-from-supabase.sh. Exits non-zero if anything differs.
set -euo pipefail
cd "$(dirname "$0")/.."

val() { grep "^$1=" "$2" | cut -d= -f2- | tr -d '"'; }
# pg_dump / psql from the host if installed, else from the Postgres image (host network, so 127.0.0.1 is this machine)
pg() { if command -v "$1" > /dev/null; then "$@"; else docker run --rm -i --network host -e PGPASSWORD postgres:17-alpine "$@"; fi; }
REMOTE="host=$(val SUPABASE_DB_HOST .env.local) port=5432 user=$(val SUPABASE_DB_USER .env.local) dbname=postgres sslmode=require"
LOCAL="host=127.0.0.1 port=$(val POSTGRES_PORT .env) user=optotester dbname=optotester"
# Sorted before comparing: "union all" without "order by" can return the tables in either order
Q="select 'questions', count(*), md5(string_agg(t::text, '|' order by t.id::text)) from questions t
   union all select 'questions_duplicate', count(*), md5(string_agg(t::text, '|' order by t.id::text)) from \"questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep\" t
   union all select 'user_activity', count(*), md5(string_agg(t::text, '|' order by t.id)) from user_activity t"

R=$(PGPASSWORD=$(val SUPABASE_DB_PASSWORD .env.local) pg psql "$REMOTE" -AtF' ' -c "$Q" | sort)
L=$(PGPASSWORD=$(val POSTGRES_PASSWORD .env) pg psql "$LOCAL" -AtF' ' -c "$Q" | sort)
echo "Supabase:"; echo "$R"
echo "Local:";    echo "$L"
if [ "$R" = "$L" ]; then echo "MATCH: local Postgres is identical to Supabase"; else echo "DIFFERENT" >&2; exit 1; fi
