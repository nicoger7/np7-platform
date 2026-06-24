-- 059 · Active-vs-on-website split for experiences + built-in Photographer role
--
-- Two small, additive concerns:
--
-- 1) exp_experiences.website_visible — separates "this experience is ACTIVE"
--    (operationally live, taking bookings) from "show it on the public website".
--    An experience can run for real yet stay off the public site (e.g. Madagascar:
--    active, invite-only, not advertised). `status` keeps meaning the lifecycle
--    (published = active, draft, archived); website_visible gates public listing.
--    Defaults TRUE so every currently-published experience stays web-visible once
--    the public site is revealed; flip the off-website ones to false in admin.
--    Mirrors exp_packages.website_visible (migration 044).
--
-- 2) A built-in "Photographer" role (system_key = 'photographer'), seeded the same
--    way Owner/Manager were in migration 049. Its access is COMPUTED in code
--    (src/lib/access.ts builtinAccess) — Experience world only, can view
--    experiences/bookings/members and edit file storage + event content, and sees
--    NO money, costs or contact PII. Ready to assign from the Employees page so a
--    photographer stops resolving to the Owner role they were auto-given in 049.
--
-- Additive + re-runnable. Needs migrations 044 (pattern) + 045/049 (team_roles).

-- 1) website visibility ───────────────────────────────────────────────────────
alter table exp_experiences
  add column if not exists website_visible boolean not null default true;

comment on column exp_experiences.website_visible is
  'Show on the public website. An active (published) experience can still be kept off-website (invite-only). Public listings require status=published AND website_visible.';

-- 2) built-in Photographer role ────────────────────────────────────────────────
insert into team_roles (name, description, access, is_system, system_key) values
  ('Photographer',
   'Experience photos & website content only — participants and galleries, no prices, costs or personal data.',
   '{}'::jsonb, true, 'photographer')
on conflict (system_key) do update set
  name = excluded.name, description = excluded.description, is_system = true;
