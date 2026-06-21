-- Migration 035: Member community profiles
-- An opt-in public identity used across the site (trip "crew", reviews, spot
-- notes). Privacy is by projection, never by RLS: contacts RLS (migration 016)
-- still exposes a row only to its owner; member-to-member visibility is served
-- exclusively by service-role portal routes that return the opted-in fields.
-- All columns are additive + nullable, so the Notion sync (additive-only) and
-- the "tolerant of unapplied migration" code paths are both safe.

create extension if not exists citext;

alter table contacts add column if not exists username           citext;
alter table contacts add column if not exists avatar_url         text;
alter table contacts add column if not exists display_city       text;
-- member's own self-declared level for the community profile — kept SEPARATE
-- from the coaches' assessed `level` (+ `level_notes`), which stay team-owned so
-- a member self-rating can never overwrite an operational assessment.
alter table contacts add column if not exists self_level         text;
-- surface + field visibility toggles; everything defaults off (absent key = false):
--   { "surfaces": { "crew": bool, "reviews": bool, "spot_notes": bool },
--     "fields":   { "age": bool, "country": bool, "city": bool, "level": bool } }
alter table contacts add column if not exists profile_visibility jsonb not null default '{}'::jsonb;

-- usernames are unique only when set (most contacts never pick one)
create unique index if not exists contacts_username_uidx
  on contacts (lower(username::text)) where username is not null;

-- RLS unchanged: "contacts own read/update" (016) already scopes a member to
-- their own row. The new columns ride along on the existing self-update policy,
-- and the projection routes run as service role.
