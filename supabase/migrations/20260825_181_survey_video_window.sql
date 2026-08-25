-- 181: explicit loop window for the survey YouTube banner.
-- The admin gets separate Start/End fields instead of URL-parameter surgery;
-- &t=/&end= in the URL keep working as fallback for old rows.
alter table exp_surveys add column if not exists hero_video_start integer;
alter table exp_surveys add column if not exists hero_video_end integer;
