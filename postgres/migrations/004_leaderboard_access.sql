-- Per-account switch for the leaderboard, which shows everyone's activity. On by default, so existing users keep it.

alter table app_users add column if not exists can_see_leaderboard boolean not null default true;
