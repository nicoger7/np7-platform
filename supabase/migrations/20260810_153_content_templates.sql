-- ============================================================================
-- 153 — Shared content templates: write the coaching method once.
--
-- All 13 experiences carry coaching-method copy and week-outcome cards, and
-- all 13 are byte-identical — one text stored thirteen times. Changing the
-- method meant thirteen edits, and the first person to edit one would create
-- a divergence nobody would notice (the Bonaire-wind failure shape, in prose).
--
-- A template owns the words; exp_content points at it. Resolution is
-- override → template → built-in default, so per-experience custom copy stays
-- possible — it just becomes a visible choice ("customised") instead of an
-- accident. The week cards' PHOTOS stay per-experience (week_images): Alaçatı
-- and Bonaire share the same six outcomes and each shows its own six photos.
-- A template used by one experience is not a template, so images never live
-- in one.
--
-- kind is open-ended text (checked) because FAQ, packing list and the
-- cancellation policy are queued up behind the same problem.
-- ============================================================================

create table if not exists content_templates (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('method', 'outcomes', 'faq', 'packing', 'policy')),
  name text not null,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_content_templates_kind on content_templates(kind);
alter table content_templates enable row level security;

alter table exp_content add column if not exists method_template_id uuid references content_templates(id) on delete set null;
alter table exp_content add column if not exists outcomes_template_id uuid references content_templates(id) on delete set null;
-- Per-card images for the week outcomes, indexed by card position. NULL slot =
-- fall back to gallery photo N (the old positional behaviour, unchanged).
alter table exp_content add column if not exists week_images jsonb;

comment on table content_templates is
  'Shared website copy blocks (coaching method, week outcomes, …). exp_content points at one per kind; per-experience fields override when set.';
