-- 041 · Carry pre-039 skill ticks onto the v2 catalog (key-based remap).
--
-- Migration 039 replaced the 15-skill catalog with 35 new milestones under a
-- fresh keyset, which orphaned every contact_milestone that still pointed at a
-- retired milestone (its label could no longer be resolved → skills vanished
-- from the crew roster and the magazine bylines).
--
-- This rewrites those ticks to their v2 equivalent by meaning. Idempotent: it
-- only touches rows still pointing at a retired milestone, and skips a row when
-- the contact already holds the target (so re-running is a no-op and it never
-- violates the (contact_id, milestone_id) uniqueness).
--
-- `adv_freestyle` has no clean v2 equivalent and is intentionally left dormant.

with keymap(old_key, new_key) as (
  values
    ('uphaul_sail',  'bg_uphaul'),
    ('steer_turn',   'bg_steering'),
    ('sail_upwind',  'bg_upwind'),
    ('beach_start',  'bg_beachstart'),
    ('planing',      'im_planing'),
    ('footstraps',   'im_frontstrap'),
    ('harness',      'im_harness'),
    ('jibe_entry',   'im_jibeentry'),
    ('carve_jibe',   'ad_carvejibe'),
    ('water_start',  'im_waterstart'),
    ('duck_jibe',    'ad_duckjibe'),
    ('chop_hop',     'ad_chophop'),
    ('forward_loop', 'pro_forwardloop'),
    ('wave_riding',  'pro_waveriding')
),
remap as (
  select old.id as old_id, new.id as new_id
  from keymap k
  join level_milestones old on old.key = k.old_key
  join level_milestones new on new.key = k.new_key and new.active
)
update contact_milestones cm
set milestone_id = r.new_id
from remap r
where cm.milestone_id = r.old_id
  and not exists (
    select 1 from contact_milestones x
    where x.contact_id = cm.contact_id and x.milestone_id = r.new_id
  );
