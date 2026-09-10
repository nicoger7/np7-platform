-- 234 · Flags as data, so a new destination does not need a developer
--
-- Nico: "how can i add new flags without speaking to you? straight from the
-- system? missing canary flags also." Both halves of that are the same problem.
-- A flag was two things in the repo: an SVG committed to /public/flags, and a
-- keyword in a hardcoded list in lib/experience-tile.ts. Adding South Africa
-- for the 2027 Langebaan trip therefore meant a code change and a deploy, and
-- the Canary Islands quietly rendered as Spain because "tenerife" was written
-- into the Spain row.
--
-- This table is the second half made editable. The nine bundled SVGs stay
-- exactly where they are and keep working: they are the fallback, and nothing
-- here has to exist for the site to render. A row wins over them, matched on
-- its own keywords, longest keyword first — so this is also how you CORRECT
-- the bundled list without editing it.
--
-- `src` is an ordinary media-library URL (R2, via the existing image picker).
-- Deliberately not a new upload path and not a new bucket: a flag is a picture
-- like every other picture in this admin.
--
-- Read by the public site (the experience tiles resolve their flag on the
-- server, inside an ISR render), written only by the team, archived rather
-- than deleted like every other entity here.

create table if not exists exp_flags (
  id uuid primary key default gen_random_uuid(),

  -- A short handle. Free text rather than an ISO code, because half of what
  -- gets asked for is not a country: an island group, a region, a club burgee.
  code text not null,
  name text not null,

  -- The artwork. Null is allowed and means "use the bundled /public/flags file
  -- named after `code`", which is how the Canary Islands row can exist with no
  -- upload at all.
  src text,

  -- Lowercased substrings matched against an experience's free-text location.
  keywords text[] not null default '{}',

  -- Hand ordering for the picker; ties fall back to name.
  sort int not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- One live row per handle. Partial, so an archived row does not block reusing
-- its code later.
create unique index if not exists exp_flags_code_live
  on exp_flags (lower(code)) where archived_at is null;

alter table exp_flags enable row level security;

drop policy if exists exp_flags_staff on exp_flags;
create policy exp_flags_staff on exp_flags
  for all to authenticated
  using (exists (select 1 from team_members t where t.auth_user_id = auth.uid()))
  with check (exists (select 1 from team_members t where t.auth_user_id = auth.uid()));

comment on table exp_flags is
  'Admin-managed flags for the branded tiles and Promo Studio. Matched to an experience location by keyword; overrides the bundled /public/flags set, which stays as the fallback.';
