-- 044 · Off-website (private) packages
--
-- Lets a package be sold privately — bookable from the admin, but hidden from the
-- public website (experience page listing + gift dropdown). Additive and safe for
-- the Notion↔Supabase sync: default TRUE, so every existing/synced package keeps
-- showing on the website exactly as before. Mark a package private by setting this
-- to FALSE in the admin package editor.
--
-- Re-runnable.

alter table exp_packages
  add column if not exists website_visible boolean not null default true;

comment on column exp_packages.website_visible is
  'When false, the package is sold privately: still bookable in admin, hidden from the public website + gift dropdown.';

-- Backfill any rows that somehow arrived null (defensive; column is NOT NULL).
update exp_packages set website_visible = true where website_visible is null;
