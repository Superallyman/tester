-- Users flag questions that look wrong; admins fix them in the question editor. Every edit keeps a before/after
-- copy, so a bad edit can be seen and undone.

create table question_reports (
    id uuid default gen_random_uuid() not null primary key,
    question_id uuid not null references questions(id) on delete cascade,
    user_id uuid references app_users(id) on delete set null,
    reason text not null check (reason in ('wrong_answer', 'unclear', 'typo', 'outdated', 'other')),
    comment text check (char_length(comment) <= 2000),
    status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz,
    resolved_by uuid references app_users(id) on delete set null
);
create index idx_question_reports_open on question_reports (question_id) where status = 'open';

create table question_edits (
    id uuid default gen_random_uuid() not null primary key,
    question_id uuid not null references questions(id) on delete cascade,
    editor_id uuid references app_users(id) on delete set null,
    before jsonb,                      -- null when the edit created the question
    after jsonb not null,
    edited_at timestamptz not null default now()
);
create index idx_question_edits_question on question_edits (question_id, edited_at desc);

alter table questions add column if not exists updated_at timestamptz;
