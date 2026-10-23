-- Confidence (user_rating) is rated 1-4, like satisfaction. Ratings made before 2026-02-27 20:00 UTC were on a 1-10
-- scale and were converted on 2026-10-23 (1-3 -> 1, 4-5 -> 2, 6-7 -> 3, 8-10 -> 4).

alter table user_activity drop constraint if exists user_activity_user_rating_check;
alter table user_activity add constraint user_activity_user_rating_check check (user_rating >= 1 and user_rating <= 4);
