-- Spaced repetition: when each person should see each question again. Updated on every answered attempt; built from
-- the full history the first time a person needs it (app_users.review_schedule_built).

create table review_schedule (
    user_id uuid not null references app_users(id) on delete cascade,
    question_id uuid not null references questions(id) on delete cascade,
    interval_days real not null,
    ease real not null,
    reps integer not null,              -- correct answers in a row
    lapses integer not null,            -- times it was answered wrong after being learned
    last_reviewed_at timestamptz not null,
    due_at timestamptz not null,
    primary key (user_id, question_id)
);
create index idx_review_schedule_due on review_schedule (user_id, due_at);

alter table app_users add column if not exists review_schedule_built boolean not null default false;
