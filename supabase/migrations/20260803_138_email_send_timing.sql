-- 138 · When the scheduled mails go out, editable.
--
-- The lead times lived in code (SEND_SCHEDULE) and the windows the cron fires
-- in were a second, hand-maintained copy of the same numbers (WINDOW_CLOSE).
-- So "send the packing list 25 days out instead of 21" was a deploy, and doing
-- it wrong opened a silent gap: move the lead past the neighbouring window's
-- edge and the mail simply never fires, with nothing on screen to say so.
--
-- One row per mail, global for every trip — a per-edition override would mean
-- answering "when does the packing list go out?" per trip, which is not a
-- question anyone has. The code keeps its defaults; a row here replaces one.
create table if not exists email_send_timing (
  template_key text primary key,
  -- days BEFORE the trip starts (pre-trip mails)
  days_before integer check (days_before >= 0 and days_before <= 400),
  -- days AFTER the trip ends (post-trip mails)
  days_after_end integer check (days_after_end >= 0 and days_after_end <= 400),
  -- A mail counts from one end of the trip or the other, never both: two leads
  -- on one row would give it two send dates and no way to pick.
  constraint email_send_timing_one_anchor check (num_nonnulls(days_before, days_after_end) = 1),
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table email_send_timing is
  'Per-mail send lead times, global across editions. A missing row means the built-in default in src/lib/email/readiness.ts applies. The cron derives its send WINDOWS from these values, so changing one can never leave a gap.';

-- Admin-written, admin-read, never touched by a member or a public page.
alter table email_send_timing enable row level security;
