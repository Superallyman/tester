-- Data cleanup, approved by the owner on 2026-10-23 and applied to the dev database that day.
-- Kept for production: production still runs on Supabase and keeps adding rows, so run this there too, as the last
-- step of moving it to Postgres:
--   1. fresh database, schema and migrations (docker compose up -d db; npm run db:migrate)
--   2. ./postgres/sync-from-supabase.sh       copy every row
--   3. ./postgres/verify-against-supabase.sh  must print MATCH for every table
--   4. this script:  docker exec -i optotester-db psql -U optotester -d optotester -v ON_ERROR_STOP=1 < postgres/cutover/2026-10-data-cleanup.sql
-- (Step 3 compares against Supabase, so run it before this script changes anything.)
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
