-- Per-experience explainer video (Nico walks through the whole trip). Separate
-- from hero_video_url (the muted background loop). Shows a click-to-play section
-- on the experience page; hidden entirely when null.
alter table exp_content add column if not exists explainer_video_url text;
