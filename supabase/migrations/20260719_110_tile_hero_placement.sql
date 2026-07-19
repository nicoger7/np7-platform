-- Placement editor for the auto-branded card + the event hero.
-- card_placement: JSON of focal/position overrides for <BrandedTile> (photo
--   focal point, coach horizontal offset + size, flag position + fade). Empty
--   {} = use the component's built-in defaults (zero regression).
-- hero_focus: CSS object-position for the event-page hero (e.g. '50% 35%'),
--   null = center (current behaviour).
alter table exp_content add column if not exists card_placement jsonb not null default '{}'::jsonb;
alter table exp_content add column if not exists hero_focus text;
