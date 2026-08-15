-- ============================================================================
-- 166 — An edition needs its own sales copy.
--
-- The event page reads `exp_experiences.description` and nothing else, so the
-- only place to describe a clinic was the EXPERIENCE — the reusable format.
-- Write "the week before OBX Wind kicks off … coaching with Dennis Robinson"
-- there and the second US edition inherits a paragraph about Hatteras.
--
-- Same rule the packing list and pre-trip note already follow: the edition
-- value wins, the experience is the fallback. Null = inherit, so nothing
-- changes for the editions that don't set one.
-- ============================================================================

alter table exp_editions add column if not exists description text;

comment on column exp_editions.description is
  'Sales copy for THIS run — the spot, the dates, who coaches it. Null inherits exp_experiences.description, which should describe the format rather than any one edition.';
