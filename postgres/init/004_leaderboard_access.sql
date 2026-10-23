-- Per-account switch for the leaderboard, which shows everyone's activity. On by default, so existing users keep it.
-- Apply to an existing database with: docker exec -i optotester-db psql -U optotester -d optotester < postgres/init/004_leaderboard_access.sql

alter table app_users add column if not exists can_see_leaderboard boolean not null default true;
