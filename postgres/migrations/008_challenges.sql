-- Challenges: one person fixes an exam (questions, order, time limit) and others take exactly the same one.
-- Each person's first finished attempt is their entry. Visible only to accounts that can see the leaderboard.

create table challenges (
    id uuid default gen_random_uuid() not null primary key,
    creator_id uuid references app_users(id) on delete set null,
    title text not null check (char_length(title) between 1 and 120),
    question_ids uuid[] not null check (cardinality(question_ids) between 1 and 400),
    time_limit_sec integer check (time_limit_sec > 0),
    created_at timestamptz not null default now()
);
create index idx_challenges_created on challenges (created_at desc);

create table challenge_entries (
    challenge_id uuid not null references challenges(id) on delete cascade,
    user_id uuid not null references app_users(id) on delete cascade,
    exam_attempt_id uuid references exam_attempts(id) on delete set null, -- removing the exam from history keeps the score
    correct integer not null,
    total integer not null,
    elapsed_sec integer not null,
    finished_at timestamptz not null,
    primary key (challenge_id, user_id)
);
