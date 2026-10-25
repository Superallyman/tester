-- How hard each question is for everyone: of the people who have answered it, how many got it right on their
-- first try (re-drilling can't make a question look easy). Skips, placeholder rows and test accounts are left out.
create view question_difficulty as
with first_tries as (
    select distinct on (question_id, user_email) question_id, is_correct
    from user_activity
    where cardinality(submitted_answer) > 0 and user_email not like 'claude-e2e%' and user_email <> 'anonymous'
    order by question_id, user_email, attempted_at, id
)
select question_id, count(*)::int as people, count(*) filter (where is_correct)::int as first_correct
from first_tries
group by question_id;
