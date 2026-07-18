-- The Hours Log form (src/app/admin/hours-log/page.tsx CATEGORIES) offers
-- coaching / planning / admin / travel / content / other, but the original
-- check constraint only allowed a different, stale vocabulary (preparation /
-- on_water / marketing / general) — so logging with "planning", "content" or
-- "other" failed with hours_log_category_check. Align the constraint to what
-- the form actually offers; keep "general" too (2 existing rows use it, and
-- the form has a "General (not experience-specific)" toggle).
alter table hours_log drop constraint if exists hours_log_category_check;
alter table hours_log add constraint hours_log_category_check
  check (category = any (array[
    'coaching', 'planning', 'admin', 'travel', 'content', 'other', 'general'
  ]));
