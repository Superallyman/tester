#!/usr/bin/env bash
# Rebuilds a production install's database from Supabase, start to finish: wipes the database volume, copies every
# row, verifies the copy, cleans it, then starts the app (which applies the migrations). Run it from the checkout,
# right before pointing traffic at this machine, so the copy has Supabase's latest rows:
#   ./postgres/cutover/rebuild-from-supabase.sh <admin email> [<admin email> ...]
# DELETES everything in this machine's database, so never run it once this machine is the live site.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ $# -ge 1 ] || { echo "usage: $0 <admin email> [...]" >&2; exit 2; }

# Only the app and database: a cloudflared container on the same compose network keeps running
docker compose rm --stop --force next-tester db
docker volume rm optotester_pgdata   # docker-compose.yml pins the project name to optotester
docker compose up -d db
until docker exec optotester-db pg_isready -U optotester -d optotester -q; do sleep 2; done
# pg_isready answers before the init scripts finish creating the base schema
until docker exec optotester-db psql -U optotester -d optotester -Atc "select to_regclass('public.user_activity')" | grep -q user_activity; do sleep 2; done

./postgres/sync-from-supabase.sh
./postgres/verify-against-supabase.sh
docker exec -i optotester-db psql -U optotester -d optotester -v ON_ERROR_STOP=1 < postgres/cutover/2026-10-data-cleanup.sql

docker compose up -d --build
until docker exec optotester-db psql -U optotester -d optotester -Atc "select count(*) from schema_migrations" 2>/dev/null \
    | grep -qx "$(ls postgres/migrations/*.sql | wc -l)"; do sleep 2; done
for email in "$@"; do
    # On stdin, since psql only fills in :'email' there, not in -c
    echo "update app_users set is_admin = true where email = lower(trim(:'email')) returning 'admin: ' || email;" \
        | docker exec -i optotester-db psql -U optotester -d optotester -v ON_ERROR_STOP=1 -v email="$email" -At
done
docker exec optotester-db psql -U optotester -d optotester -Atc \
    "select 'questions ' || count(*) from questions union all select 'history ' || count(*) from user_activity union all select 'accounts ' || count(*) from app_users"
