-- 070 · Wave & Freestyle skill catalog
--
-- Fills out the "side" discipline (Wave & Freestyle) from 2 skills to 23:
-- wave riding line (bottom turn → top turn → cutback → aerial → goiter),
-- jumps/loops (table top, back loop, push loop, double forward) and
-- freestyle (sail 360 → vulcan → spock/flaka → shaka → kono), each with a
-- difficulty grade and a prerequisite chain like the core tracks.
--
-- Side skills are EXCLUDED from the rank ladder (buildProgression skips
-- discipline='side'), so this changes no member's rank — display only.
--
-- NOTE: already applied directly via the service role on 2026-07-07; this file
-- is the repo record. Additive + idempotent (WHERE NOT EXISTS on key).

insert into level_milestones
  (key, label, tier, discipline, difficulty, sort_order, prerequisite_key, description, active)
select v.key, v.label, v.tier, 'side', v.difficulty, v.sort_order, v.prerequisite_key, v.description, true
from (values
  ('fs_sail360',      'Sail 360',        'Advanced',  40, 500, 'im_nonplaningjibe', 'Spin the sail through a full 360 while sailing - the classic old-school starter trick.'),
  ('fs_bodydrag',     'Body drag',       'Advanced',  48, 505, 'im_frontstrap',     'Step off and drag beside the planing board, then climb back on without sinking it.'),
  ('wv_wavejump',     'Wave jump',       'Advanced',  50, 510, 'ad_chophop',        'Use a wave as a ramp for a controlled jump with a soft, sailing-away landing.'),
  ('fs_helitack',     'Heli tack',       'Advanced',  55, 515, 'im_tack',           'Tack the sail through the wind while the board holds its line - the sail spins, you do not.'),
  ('wv_bottomturn',   'Bottom turn',     'Advanced',  62, 520, 'im_waterstart',     'Carve off the bottom of the wave to set up the next hit.'),
  -- pro_waveriding (existing) re-slots to 525
  ('wv_topturn',      'Top turn',        'Pro',       68, 530, 'wv_bottomturn',     'Redirect off the top of the wave and drop back down the face.'),
  -- pro_forwardloop (existing) re-slots to 535
  ('wv_cutback',      'Cutback',         'Pro',       72, 540, 'wv_topturn',        'Carve hard back toward the pocket when you outrun the wave''s power.'),
  ('jp_tabletop',     'Table top',       'Pro',       75, 545, 'wv_wavejump',       'Flatten the board out overhead mid-jump, then bring it back under you to land.'),
  ('wv_backside',     'Backside riding', 'Pro',       78, 550, 'wv_topturn',        'Ride the wave with your back to it - timing over sight.'),
  ('jp_backloop',     'Back loop',       'Pro',       82, 555, 'wv_wavejump',       'Rotate backward over the top of a jump and spot the landing late.'),
  ('fs_vulcan',       'Vulcan',          'Pro',       84, 560, 'ad_chophop',        'Pop, slide the board 180 backwards and switch the hands - the new-school gateway move.'),
  ('wv_aerial',       'Aerial',          'Pro',       85, 565, 'wv_topturn',        'Launch off the lip and land back on the face or in the flat.'),
  ('fs_airjibe',      'Air jibe',        'Pro',       86, 570, 'fs_vulcan',         'Vulcan rotation carried all the way through to sailing away on the new tack.'),
  ('jp_pushloop',     'Push loop',       'Pro',       88, 575, 'pro_forwardloop',   'Rotate backward over the sail off a steep ramp - the commitment move.'),
  ('fs_spock',        'Spock',           'Pro',       88, 580, 'fs_vulcan',         'A vulcan plus a full 360 spin on the nose.'),
  ('fs_flaka',        'Flaka',           'Pro',       90, 585, 'fs_vulcan',         'Planing upwind 360 with the nose pushed through the wind.'),
  ('wv_360',          'Wave 360',        'Pro',       90, 590, 'wv_cutback',        'Full rotation on the wave face without losing the wave.'),
  ('wv_goiter',       'Goiter',          'Pro',       95, 595, 'wv_aerial',         'An aerial rotated back into the wave - one of wave sailing''s hardest moves.'),
  ('fs_shaka',        'Shaka',           'Pro',       96, 600, 'fs_flaka',          'Flaka family with the rig thrown flat - the modern contest staple.'),
  ('fs_kono',         'Kono',            'Pro',      100, 605, 'fs_shaka',          'Off-the-wind pop into a boosted flaka rotation - elite freestyle.'),
  ('jp_doubleforward','Double forward',  'Pro',      110, 610, 'pro_forwardloop',   'Two forward rotations off one ramp - PWA Pozo territory.')
) as v(key, label, tier, difficulty, sort_order, prerequisite_key, description)
where not exists (select 1 from level_milestones m where m.key = v.key);

-- Re-slot the two pre-existing side skills into the difficulty order (display only).
update level_milestones set sort_order = 525 where key = 'pro_waveriding';
update level_milestones set sort_order = 535 where key = 'pro_forwardloop';
