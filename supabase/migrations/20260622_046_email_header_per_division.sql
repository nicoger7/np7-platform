-- 046 · Per-division email header image + vertical position
--
-- The email header photo was a single column (header_image, migration 029) shared
-- across both worlds. This lets Experience and Hardware each have their OWN header
-- image, plus a vertical focal point (0–100 %) so an uploaded photo can be nudged
-- up/down inside the hero frame.
--
--   header_image            → Experience header (existing column, unchanged)
--   header_image_hardware   → Hardware header
--   header_position         → Experience header background-position-y (%) , default 50
--   header_position_hardware→ Hardware header background-position-y (%) , default 50
--
-- Additive + re-runnable. Reads are tolerant of these columns being absent until
-- applied (Hardware just falls back to no/own default header, position to centre).

alter table email_templates
  add column if not exists header_image_hardware    text,
  add column if not exists header_position          int  not null default 50,
  add column if not exists header_position_hardware int  not null default 50;

comment on column email_templates.header_image_hardware is 'Hardware-world header image (Experience uses header_image).';
comment on column email_templates.header_position is 'Experience header vertical focal point, 0–100 % (background-position-y).';
comment on column email_templates.header_position_hardware is 'Hardware header vertical focal point, 0–100 %.';
