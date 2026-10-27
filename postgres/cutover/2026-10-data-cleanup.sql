-- Data cleanup, approved by the owner on 2026-10-23 and applied to the dev database that day.
-- Kept for production: production still runs on Supabase and keeps adding rows, so run this there too, as the last
-- step of moving it to Postgres:
--   1. fresh database with only the base schema (docker compose up -d db; no migrations yet)
--   2. ./postgres/sync-from-supabase.sh       copy every row
--   3. ./postgres/verify-against-supabase.sh  must print MATCH for every table
--   4. this script:  docker exec -i optotester-db psql -U optotester -d optotester -v ON_ERROR_STOP=1 < postgres/cutover/2026-10-data-cleanup.sql
--   5. migrations (npm run db:migrate, or start the app container, which runs them first)
-- (Step 3 compares against Supabase, so run it before this script changes anything. Migrations come last:
-- 002 creates an account for every email in the copied history, and 003's 1-4 rating check needs part 4 below.)
-- Safe to run more than once: each part only touches rows or tables that still need it, and prints what it changed.
-- Numbers below are from the dev copy on 2026-10-23; production's will be similar or larger.

-- 1. February 2026 test rows: history rows with no answer from before March 2026, mostly bulk inserts (241 of 366
--    came 5 or more to the same second), 57 of them marked correct. In the dev copy they were 317 of the owner's
--    375 rows (shown accuracy 15%, real 26%) and 44 of another user's 663. Blank rows since March are genuine skips
--    and are kept.
begin;
delete from user_activity
where coalesce(cardinality(submitted_answer), 0) = 0 and attempted_at < '2026-03-01';
commit;

-- 2. Rows recorded as "anonymous" (from before sign-in was required). They belong to no account.
begin;
delete from user_activity where user_email = 'anonymous';
commit;

-- 3. "questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep" is not a plain copy: it holds the whole bank plus 358
--    questions that were never in it (Schwartz Exam Practice 1-3, Peds Parisi / Ciner, Alberta Star Question).
--    Nothing reads it. Kept under a clearer name; whether the extra questions join the bank is a separate decision.
do $$
begin
    if to_regclass('public."questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep"') is not null and to_regclass('public.questions_archive') is null then
        alter table "questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep" rename to questions_archive;
        raise notice 'renamed questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep to questions_archive';
    end if;
end $$;
comment on table questions_archive is 'Original full import. Holds the live bank plus 358 questions (Schwartz, Peds, Alberta Star) that were never in it.';

-- 4. Confidence (user_rating) was rated 1-10 until 2026-02-27 20:00 UTC; convert those ratings to the 1-4 scale
--    (1-3 -> 1, 4-5 -> 2, 6-7 -> 3, 8-10 -> 4), as on dev on 2026-10-23. updated_at is left as it was. Runs only
--    while the old 1-10 check is in place, and swaps in the 1-4 check (what migration 003 does), so a second run
--    can't convert a rating twice.
do $$
declare n int;
begin
    if exists (select 1 from pg_constraint where conname = 'user_activity_user_rating_check'
               and pg_get_constraintdef(oid) like '%<= 10%') then
        alter table user_activity disable trigger update_user_activity_modtime;
        update user_activity set user_rating = case
                when user_rating <= 3 then 1
                when user_rating <= 5 then 2
                when user_rating <= 7 then 3
                else 4 end
        where attempted_at < '2026-02-27 20:00Z' and user_rating is not null;
        get diagnostics n = row_count;
        alter table user_activity drop constraint user_activity_user_rating_check;
        alter table user_activity add constraint user_activity_user_rating_check check (user_rating >= 1 and user_rating <= 4);
        alter table user_activity enable trigger update_user_activity_modtime;
        raise notice 'converted % confidence ratings from 1-10 to 1-4', n;
    end if;
end $$;
