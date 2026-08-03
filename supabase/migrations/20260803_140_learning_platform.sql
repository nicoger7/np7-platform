-- Migration 140: the staff academy — courses, lessons, and who has read what.
--
-- How NP7 runs currently lives in Nico's head and in whoever happened to be
-- standing next to him. This turns that into rows: a handful of courses (using
-- the admin, the coaching method, working with guests), each a short list of
-- lessons, plus one row per member per lesson so "is the team trained" stops
-- being a feeling.
--
-- Deliberately NOT an LMS. There is no score, no pass mark, no certificate and
-- no attempt table. At this headcount competence is watched, not inferred, and a
-- completion percentage measures compliance with a workflow rather than skill.
-- The one thing tracked is `completed_at`, and it is self-declared on purpose.
--
-- Shape notes worth knowing before you edit anything here:
--   * `body` is HTML from src/components/admin/rich-text-editor.tsx — the editor
--     the email composer already uses. Pasted text, images and YouTube embeds
--     therefore arrive without a second authoring stack to maintain.
--   * `minutes` is author-declared and shown next to every lesson title. Long
--     modules are the ones nobody finishes, so the cost is made visible at the
--     moment of writing, not discovered afterwards.
--   * `route_hint` points a lesson at the admin page it teaches. Today it renders
--     as an "open the page" link; it is also the hook a future in-admin Help
--     button needs, which is why the column exists before that button does.
--   * `role_ids` + `required` are the onboarding path. A required course tagged
--     with a role IS that role's path; everything else is reference material.
--     One corpus, two views — a second "onboarding" system would drift.
--   * `owner_id` / `review_every_days` are the anti-rot half. Admin lessons go
--     stale fastest (menu labels move under them), so a course carries a named
--     owner and a review clock rather than a silent last-edited date.
--
-- Additive-only; RLS zero-policy (service role only — same pattern as 087/129):
-- everything reaches these tables through /api/admin/learning, which resolves
-- the acting team member server-side.

-- ── Courses ──────────────────────────────────────────────────────────────────

create table if not exists tr_courses (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  summary           text,                            -- one line; the card subtitle
  description       text,                            -- HTML from the rich-text editor
  icon              text,                            -- icon key, see src/lib/learning.ts
  sort_order        int not null default 0,
  status            text not null default 'draft'
                    check (status in ('draft','published')),

  -- Who this is for. Empty array = everyone, which is the common case; naming
  -- roles narrows it without hiding the course from anyone who goes looking.
  role_ids          uuid[] not null default '{}',
  required          boolean not null default false,

  owner_id          uuid references team_members(id) on delete set null,
  reviewed_at       timestamptz,
  review_every_days int not null default 180,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz
);
create index if not exists tr_courses_sort_idx on tr_courses (sort_order);

comment on table tr_courses is
  'Staff academy: a track of short lessons (see tr_lessons). Reader + author UI at /admin/learning.';

-- ── Lessons ──────────────────────────────────────────────────────────────────

create table if not exists tr_lessons (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references tr_courses(id) on delete cascade,
  slug        text not null,
  title       text not null,
  summary     text,
  body        text,                                  -- HTML: text, images, embeds
  video_url   text,                                  -- YouTube/Vimeo watch or share link
  minutes     int not null default 3,
  sort_order  int not null default 0,
  status      text not null default 'draft'
              check (status in ('draft','published')),
  route_hint  text,                                  -- '/admin/bookings'
  -- ["You can confirm a booking without asking anyone", …] — what the reader
  -- should be able to do afterwards. A takeaway list, never a graded question.
  takeaways   jsonb not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  unique (course_id, slug)
);
create index if not exists tr_lessons_course_idx on tr_lessons (course_id, sort_order);
create index if not exists tr_lessons_route_idx on tr_lessons (route_hint);

-- ── Progress ─────────────────────────────────────────────────────────────────
-- One row per member per lesson, mirroring contact_milestones (migration 036).
-- `opened_at` is written the first time a lesson is rendered so a course can
-- show "started" without the member having to claim anything.

create table if not exists tr_progress (
  lesson_id    uuid not null references tr_lessons(id) on delete cascade,
  member_id    uuid not null references team_members(id) on delete cascade,
  opened_at    timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (lesson_id, member_id)
);
create index if not exists tr_progress_member_idx on tr_progress (member_id);

-- ── Seed: the three tracks Nico named ────────────────────────────────────────
-- Empty of lessons on purpose, but PUBLISHED: the structure has to be visible
-- before anyone will write into it, and an empty course with a real description
-- is an invitation where an empty database is a blank page. Two are marked
-- `required` — the admin and the method are the path, guest scenarios are the
-- reference you reach for when the situation lands.

insert into tr_courses (slug, title, summary, description, icon, sort_order, status, required, review_every_days) values
  ('using-the-admin', 'Using the admin',
   'Every screen you actually touch, one short lesson each.',
   '<p>The back office, one page at a time. Each lesson is a single screen — what it is for, the five steps that matter, and the mistakes that are annoying to undo.</p><p>Read the one you need when you need it. You are not expected to read them in order.</p>',
   'grid', 10, 'published', true, 90),
  ('np7-coaching-method', 'The NP7 coaching method',
   'How we teach windsurfing — and why we teach it that way.',
   '<p>NP7 coaches the whole rider: technique, fundamentals, mindset, decision-making, reading conditions, confidence, enjoyment. This track is the standard we all teach to, so a guest gets the same coaching whoever is on the water with them.</p><p>Watch first, then take it to the beach. The lesson is the standard — not whatever habit you picked up from the last coach you shadowed.</p>',
   'compass', 20, 'published', true, 180),
  ('working-with-guests', 'Working with guests',
   'Real situations, what we do, and the line that usually works.',
   '<p>Three days of no wind. A room complaint. Someone well below the level they booked. These are the moments that decide whether a guest comes back, and none of them are improvised well.</p><p>Each lesson is one situation: what happened, what we do, why, and the line that usually works. Use them as role-play prompts — the platform holds the standard, the practice happens in person.</p>',
   'users', 30, 'published', false, 365)
on conflict (slug) do nothing;

-- ── RLS: zero-policy enables (service role only, like migrations 087/129) ────
-- Nothing here is ever rendered on a public or member page, and is_team_member()
-- would be the wrong grain anyway: authoring is a role grant, reading is not.

alter table tr_courses  enable row level security;
alter table tr_lessons  enable row level security;
alter table tr_progress enable row level security;
