-- public schema as dumped from the Supabase project (Postgres 17.6), minus Supabase-only roles, grants and RLS.

create table questions (
    id uuid default gen_random_uuid() not null primary key,
    category text not null,
    question_text text not null,
    options text[] not null,
    correct_answers text[] not null,
    explanation text,
    created_at timestamptz default now()
);

create table "questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep" (
    id uuid default gen_random_uuid() not null primary key,
    category text not null,
    question_text text not null,
    options text[] not null,
    correct_answers text[] not null,
    explanation text,
    created_at timestamptz default now()
);
comment on table "questions_duplicate_ALLSAVEDINCLUDINGNon_Optoprep" is 'This is a duplicate of questions';

create table user_activity (
    id uuid default gen_random_uuid() not null primary key,
    question_id uuid references questions(id) on delete cascade,
    is_correct boolean not null,
    user_rating integer check (user_rating >= 1 and user_rating <= 10),
    attempted_at timestamptz default now(),
    user_email text,
    submitted_answer text[] default '{}'::text[],
    satisfaction_rating integer check (satisfaction_rating >= 1 and satisfaction_rating <= 4),
    updated_at timestamptz default now()
);

create index idx_user_activity_question_id on user_activity (question_id);
-- Not in Supabase: every per-user page filters on email
create index idx_user_activity_email on user_activity (user_email, attempted_at);

create function update_modified_column() returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger update_user_activity_modtime before update on user_activity
    for each row execute function update_modified_column();

create function get_category_counts() returns table (cat_name text, q_count bigint) language sql as $$
    select category, count(*) from questions group by category;
$$;

create function search_questions_by_phrase(search_term text) returns setof questions language plpgsql as $$
begin
    return query
    select * from questions
    where question_text ilike '%' || search_term || '%'
       or explanation ilike '%' || search_term || '%'
       or options::text ilike '%' || search_term || '%';
end;
$$;
