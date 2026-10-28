-- "Simple reveal": after submitting, mark answers with a plain check / cross / dash beside each option instead of
-- coloured options, so a screenshot can be studied with the marks covered
alter table app_users add column if not exists simple_reveal boolean not null default false;
