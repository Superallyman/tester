-- Practice exams, saved on the server so they can be resumed on any device and reviewed later.
-- One row per exam. While it's in progress, `state` is the browser's ExamState. Once finished, `summary` holds the
-- score breakdown. `questions` is a snapshot of the items as shown, so a review still matches what was on screen
-- after the question bank is edited.

create table exam_attempts (
    id uuid default gen_random_uuid() not null primary key,
    user_id uuid not null references app_users(id) on delete cascade,
    client_id text not null,           -- ExamState.id, so a browser's copy and its server row always pair up
    label text not null,
    status text not null check (status in ('in_progress', 'finished')),
    questions jsonb,                   -- null for summaries imported from a browser's history, which kept no detail
    state jsonb,
    summary jsonb,
    total integer not null,
    answered integer,
    correct integer,
    elapsed_sec integer not null default 0,
    started_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    finished_at timestamptz,
    unique (user_id, client_id)
);

create index idx_exam_attempts_user on exam_attempts (user_id, finished_at desc);
-- The exam page offers a single "resume"; starting a new exam replaces the unfinished one
create unique index one_exam_in_progress on exam_attempts (user_id) where status = 'in_progress';
