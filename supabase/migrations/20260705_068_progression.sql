-- 068: progression system — discipline tracks + difficulty scores + prerequisites + verification tier
--
-- Builds on the existing level_milestones / contact_milestones catalog. Core is
-- Freeride · Freerace · Slalom (waves/freestyle become 'side' skills). Each skill
-- gets a difficulty score and a prerequisite; each achievement gets a verification
-- tier: self (logged) → windcoach (video) → coach (on a trip = the gold standard).
--
-- Safe on live data: contact_milestones has 368 achievements, 367 of them on the
-- canonical bg_/im_/ad_/pro_ keys — so retiring the older short-key duplicates
-- (0 live achievements) doesn't orphan anything. Additive otherwise.

-- ── columns ────────────────────────────────────────────────────────────────
alter table level_milestones add column if not exists difficulty        int not null default 10;
alter table level_milestones add column if not exists prerequisite_key   text;

alter table contact_milestones add column if not exists verified_via text not null default 'coach'; -- existing were coach-ticked
alter table contact_milestones add column if not exists verified_at  timestamptz;
alter table contact_milestones add column if not exists verified_ref text; -- trip/edition id, or a wind.coach video ref
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contact_milestones_verified_via_chk') then
    alter table contact_milestones add constraint contact_milestones_verified_via_chk
      check (verified_via in ('self','windcoach','coach'));
  end if;
end $$;

-- ── dedup: retire the older short-key duplicates (superseded by bg_/im_/ad_/pro_) ──
update level_milestones set active = false
 where key in ('uphaul_sail','steer_turn','sail_upwind','beach_start','planing','footstraps','harness',
               'jibe_entry','carve_jibe','water_start','duck_jibe','chop_hop','forward_loop','wave_riding');

-- ── discipline · difficulty · prerequisite on the canonical catalog ───────────
update level_milestones m set
  discipline = v.discipline, difficulty = v.difficulty, prerequisite_key = nullif(v.prereq, '')
from (values
  ('bg_uphaul','freeride',5,''),          ('bg_rigging','freeride',5,''),
  ('bg_steering','freeride',8,'bg_uphaul'),('bg_beachstart','freeride',10,'bg_steering'),
  ('bg_upwind','freeride',12,'bg_beachstart'),('bg_goreturn','freeride',10,'bg_beachstart'),
  ('im_planing','freeride',20,'bg_upwind'),('im_frontstrap','freeride',22,'im_planing'),
  ('im_backstrap','freeride',24,'im_frontstrap'),('im_harness','freeride',22,'im_planing'),
  ('im_tack','freeride',26,'im_planing'),  ('im_jibeentry','freeride',24,'im_planing'),
  ('im_nonplaningjibe','freeride',28,'im_jibeentry'),('im_trim','freeride',25,'im_harness'),
  ('im_waterstart','freeride',38,'im_harness'),('ad_carvejibe','freeride',50,'im_nonplaningjibe'),
  ('ad_chophop','freeride',45,'im_waterstart'),('ad_underpowered','freeride',40,'ad_carvejibe'),
  ('im_railing','freerace',40,'im_backstrap'),('im_20kn','freerace',35,'im_railing'),
  ('im_20knctrl','freerace',40,'im_railing'),('im_25kn','freerace',48,'im_20knctrl'),
  ('im_25knctrl','freerace',52,'im_20knctrl'),('ad_tuning','freerace',45,'im_25knctrl'),
  ('ad_overpowered','freerace',55,'im_25knctrl'),('ad_duckjibe','freerace',65,'ad_carvejibe'),
  ('ad_30kn','freerace',70,'im_25kn'),     ('ad_30knctrl','freerace',75,'im_25knctrl'),
  ('ad_boardflying','freerace',70,'ad_30knctrl'),('pro_powerjibe','freerace',60,'ad_duckjibe'),
  ('pro_racingbasics','slalom',60,'ad_30knctrl'),('pro_racingadv','slalom',90,'pro_racingbasics'),
  ('pro_35kn','slalom',85,'ad_30kn'),      ('pro_35knctrl','slalom',95,'ad_30knctrl'),
  ('pro_40knctrl','slalom',110,'pro_35knctrl'),
  ('pro_forwardloop','side',70,''),        ('pro_waveriding','side',65,''),
  ('adv_freestyle','side',80,'')
) as v(key,discipline,difficulty,prereq)
where m.key = v.key;
