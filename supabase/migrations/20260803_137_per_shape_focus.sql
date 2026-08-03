-- Per-shape image framing for heroes.
--
-- One focal point had to serve a 2.4:1 desktop banner AND a 0.72:1 phone hero,
-- so the Desktop/Tablet/Phone chips in the placement editor could only ever
-- change the preview. Framing is now stored per shape.
--
-- Deliberately additive rather than widening hero_focus to jsonb: /hardware and
-- /hardware/fins drop that column straight into background-position /
-- object-position, so a JSON value there would render as garbage. hero_focus
-- keeps holding the plain CSS string — which is also the DESKTOP value and the
-- one every other shape inherits — and only the overrides move here:
--   {"tablet":"40% 30%","phone":"55% 20%"}   (a missing shape = inherit desktop)
-- Readers that know nothing about this column therefore keep framing correctly.
alter table exp_content add column if not exists hero_focus_shapes jsonb not null default '{}'::jsonb;
alter table hw_product_content add column if not exists hero_focus_shapes jsonb not null default '{}'::jsonb;
