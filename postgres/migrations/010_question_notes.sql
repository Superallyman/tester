-- A person's own note and bookmark on a question. Private: nobody else (admins included) sees them in the app.
create table question_notes (
    user_id uuid not null references app_users(id) on delete cascade,
    question_id uuid not null references questions(id) on delete cascade,
    note text not null default '' check (char_length(note) <= 5000),
    bookmarked boolean not null default false,
    updated_at timestamptz not null default now(),
    primary key (user_id, question_id)
);
create index idx_question_notes_bookmarked on question_notes (user_id) where bookmarked;
