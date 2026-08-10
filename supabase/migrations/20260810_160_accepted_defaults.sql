-- ============================================================================
-- 160 — "The standard is my choice" is an answer, not a gap.
--
-- The launch check flagged every trip still carrying the standard week title,
-- outcome cards, program or FAQ as "to polish" — forever. But sharing the
-- standard week across trips is a deliberate design (the template system
-- exists precisely to share it), so those ambers could never be cleared, and
-- a checklist that cannot reach green is a checklist people learn to ignore.
--
-- This records the decision: check ids the team has explicitly said "keep the
-- standard" for. An accepted check passes. Undoing it in the UI removes the id
-- again — nothing else changes, so it is always reversible.
-- ============================================================================

alter table exp_content add column if not exists accepted_defaults jsonb not null default '[]'::jsonb;

comment on column exp_content.accepted_defaults is
  'Launch-check ids (weekTitle, outcomes, program, faq, review…) where the standard content was explicitly kept. An accepted check shows green: the default is a decision, not a gap.';
