-- Migration 039: Level milestones v2 — richer windsurf catalog + short labels
-- Moves to a real milestone basis: `label` is the short chip, `description` the
-- full text (tooltip). Retires the initial 15-skill seed (036) and inserts the
-- fuller ~35-skill ladder. Additive + idempotent; tolerant code reads `label`
-- and falls back when `description` is absent.

alter table level_milestones add column if not exists description text;

-- retire the original 036 seed (kept inactive, not deleted, so old ticks survive)
update level_milestones set active = false
 where key in ('uphaul_sail','steer_turn','sail_upwind','beach_start','planing','footstraps',
               'harness','jibe_entry','carve_jibe','water_start','duck_jibe','chop_hop',
               'forward_loop','wave_riding','adv_freestyle');

insert into level_milestones (key, label, description, tier, discipline, sort_order) values
  -- Beginner
  ('bg_uphaul',        'Uphaul',          'Uphaul & sail',                'Beginner',     'windsurf',  10),
  ('bg_rigging',       'Rigging',         'Basic rigging',                'Beginner',     'windsurf',  20),
  ('bg_steering',      'Steering',        'Steering & turning',           'Beginner',     'windsurf',  30),
  ('bg_goreturn',      'Go & return',     'Go & return',                  'Beginner',     'windsurf',  40),
  ('bg_upwind',        'Upwind',          'Sail upwind',                  'Beginner',     'windsurf',  50),
  ('bg_beachstart',    'Beach start',     'Beach start',                  'Beginner',     'windsurf',  60),
  -- Intermediate
  ('im_planing',       'Planing',         'Planing (ideal conditions)',   'Intermediate', 'windsurf', 100),
  ('im_frontstrap',    'Front strap',     'Front strap',                  'Intermediate', 'windsurf', 110),
  ('im_backstrap',     'Back strap',      'Back strap',                   'Intermediate', 'windsurf', 120),
  ('im_harness',       'Harness',         'Harness',                      'Intermediate', 'windsurf', 130),
  ('im_tack',          'Tack',            'Tack on intermediate gear',    'Intermediate', 'windsurf', 140),
  ('im_jibeentry',     'Jibe entry',      'Jibe entry',                   'Intermediate', 'windsurf', 150),
  ('im_nonplaningjibe','Non-planing jibe','Non-planing jibe',             'Intermediate', 'windsurf', 160),
  ('im_trim',          'Trim',            'Sail adjustments',             'Intermediate', 'windsurf', 170),
  ('im_waterstart',    'Waterstart',      'Waterstart',                   'Intermediate', 'windsurf', 180),
  ('im_20kn',          '20kn',            '20 knots max speed',           'Intermediate', 'windsurf', 190),
  ('im_25kn',          '25kn',            '25 knots max speed',           'Intermediate', 'windsurf', 200),
  ('im_20knctrl',      '20kn+ control',   'Handling 20 knots+',           'Intermediate', 'windsurf', 210),
  ('im_railing',       'Railing',         'Board railing',                'Intermediate', 'windsurf', 220),
  -- Advanced
  ('ad_carvejibe',     'Carve jibe',      'Planing carve jibe',           'Advanced',     'windsurf', 300),
  ('ad_duckjibe',      'Duck jibe',       'Duck jibe',                    'Advanced',     'windsurf', 310),
  ('ad_underpowered',  'Underpowered',    'Planing underpowered',         'Advanced',     'windsurf', 320),
  ('ad_overpowered',   'Overpowered',     'Planing overpowered',          'Advanced',     'windsurf', 330),
  ('ad_30kn',          '30kn',            '30 knots max speed',           'Advanced',     'windsurf', 340),
  ('ad_chophop',       'Chop hop',        'Chop hop',                     'Advanced',     'windsurf', 350),
  ('ad_tuning',        'Tuning',          'Equipment tuning',             'Advanced',     'windsurf', 360),
  ('ad_30knctrl',      '30kn+ control',   'Handling 30 knots+',           'Advanced',     'windsurf', 370),
  ('ad_boardflying',   'Board flying',    'Board flying in every condition','Advanced',   'windsurf', 380),
  -- Pro
  ('pro_forwardloop',  'Forward loop',    'Forward loop',                 'Pro',          'windsurf', 400),
  ('pro_waveriding',   'Wave riding',     'Wave riding',                  'Pro',          'windsurf', 410),
  ('pro_racingbasics', 'Racing basics',   'Basic racing tactics',         'Pro',          'windsurf', 420),
  ('pro_racingadv',    'Racing advanced', 'Advanced racing tactics',      'Pro',          'windsurf', 430),
  ('pro_powerjibe',    'Power jibe',      'High-speed power jibe',         'Pro',          'windsurf', 440),
  ('pro_35kn',         '35kn',            '35 knots max speed',           'Pro',          'windsurf', 450),
  ('pro_40knctrl',     '40kn+ control',   'Handling 40 knots+',           'Pro',          'windsurf', 460)
on conflict (key) do update set
  label = excluded.label, description = excluded.description, tier = excluded.tier,
  sort_order = excluded.sort_order, active = true;
