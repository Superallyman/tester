-- How many questions a person aims to answer each day; null = no goal set
alter table app_users add column if not exists daily_goal integer check (daily_goal between 1 and 500);
