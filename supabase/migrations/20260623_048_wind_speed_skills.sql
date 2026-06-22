-- 048 · Symmetric wind-speed skills (max speed + control), clearer labels
--
-- The level catalog already split max-speed vs control for some winds, but it was
-- incomplete (no 25kn or 35kn control) and the labels were ambiguous ("25kn" vs
-- "20kn+ control"). This makes each wind speed exist in BOTH ways and relabels
-- every wind chip explicitly as "Xkn max speed" / "Xkn control".
--
--   Intermediate: 20kn max · 20kn control · 25kn max · 25kn control
--   Advanced:     30kn max · 30kn control
--   Pro:          35kn max · 35kn control · 40kn control
--
-- Data-only + idempotent (re-runnable). New milestones default active=true, so
-- they show up on the member Progress page and the admin level review.

-- Relabel existing wind milestones for clarity.
update level_milestones set label = '20kn max speed', description = 'Hold 20 knots at max speed'      where key = 'im_20kn';
update level_milestones set label = '20kn control',   description = 'Stay in control at 20 knots+', sort_order = 195 where key = 'im_20knctrl';
update level_milestones set label = '25kn max speed', description = 'Hold 25 knots at max speed'      where key = 'im_25kn';
update level_milestones set label = '30kn max speed', description = 'Hold 30 knots at max speed'      where key = 'ad_30kn';
update level_milestones set label = '30kn control',   description = 'Stay in control at 30 knots+'     where key = 'ad_30knctrl';
update level_milestones set label = '35kn max speed', description = 'Hold 35 knots at max speed'      where key = 'pro_35kn';
update level_milestones set label = '40kn control',   description = 'Stay in control at 40 knots+'     where key = 'pro_40knctrl';

-- Fill the two missing control milestones.
insert into level_milestones (key, label, description, tier, discipline, sort_order, active) values
  ('im_25knctrl',  '25kn control', 'Stay in control at 25 knots+', 'Intermediate', 'windsurf', 205, true),
  ('pro_35knctrl', '35kn control', 'Stay in control at 35 knots+', 'Pro',          'windsurf', 455, true)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, tier = excluded.tier,
  discipline = excluded.discipline, sort_order = excluded.sort_order, active = true;
