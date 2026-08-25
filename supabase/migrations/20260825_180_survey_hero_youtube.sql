-- 180: YouTube banner for interest surveys.
-- A survey hero can play a muted YouTube loop (link may carry &t= as the loop
-- start). Null/empty = the photo hero stays; an unparseable link also falls
-- back to the photo on render, so this can never blank the page.
alter table exp_surveys add column if not exists hero_youtube text;
