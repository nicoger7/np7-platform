-- Migration 220: the product lines as they actually are, and milestones that
-- are reached by selling rather than by a date arriving.
--
-- What changed in the plan (Nico, 2026-09-04):
--   · Slalom boards: high-end HONEYCOMB, ~650 EUR FOB China, ~826 landed
--   · Freerace boards: CARBON, price not yet quoted
--   · NP7 Rockstar fin: made in GERMANY at Proceed
--   · NP7 B-Line fin: made in CHINA, quantities and prices to be agreed
--   · Year one: 350 boards, 400 Rockstar fins, 400 B-Line fins
--
-- The fin tree was modelled on disciplines (Slalom fins, Freerace fins). The
-- business is organised by PRODUCT LINE and those lines are made on different
-- continents by different suppliers, which is the distinction that actually
-- drives cost. So the discipline children are archived rather than dropped: no
-- allocation points at them today, but archiving keeps the history honest if
-- one ever did.
--
-- Idempotent, additive-only.

-- ── Milestones you reach by selling ─────────────────────────────────────────
alter table roadmap_items add column if not exists target_quantity numeric;
alter table roadmap_items add column if not exists target_metric text
  check (target_metric is null or target_metric in ('units_sold','units_made','revenue_net'));

comment on column roadmap_items.target_quantity is
  'The number this milestone is reached AT ("400 fins sold"), not a cost. The date is the forecast; the target is the actual trigger.';
comment on column roadmap_items.target_metric is
  'What is being counted: units_sold | units_made | revenue_net.';

-- ── Product lines ───────────────────────────────────────────────────────────
do $$
declare
  hw uuid; fins uuid; boards uuid; slalom uuid; freerace uuid;
  rockstar uuid; bline uuid;
begin
  select id into hw from fin_entities where key = 'np7-hardware';
  if hw is null then return; end if;
  select id into fins   from fin_cost_objects where entity_id = hw and name = 'Fins'   and parent_id is null;
  select id into boards from fin_cost_objects where entity_id = hw and name = 'Boards' and parent_id is null;

  -- discipline-shaped fin children give way to the two real lines
  update fin_cost_objects set archived_at = now()
   where entity_id = hw and parent_id = fins and name in ('Slalom fins', 'Freerace fins')
     and archived_at is null;
  update fin_cost_objects set archived_at = now()
   where entity_id = hw and archived_at is null and name like 'Slalom fin %';
  update fin_cost_objects set archived_at = now()
   where entity_id = hw and archived_at is null and name like 'Freerace fin %';

  if not exists (select 1 from fin_cost_objects where entity_id = hw and name = 'Rockstar fin') then
    insert into fin_cost_objects (entity_id, kind, name, parent_id, sort, note)
      values (hw, 'range', 'Rockstar fin', fins, 21,
              'Made in Germany at Proceed engineered composites.')
      returning id into rockstar;
    insert into fin_cost_objects (entity_id, kind, name, parent_id, sort)
    select hw, 'size', 'Rockstar ' || v, rockstar, 410 + row_number() over ()
      from unnest(array['30','32','34','36','38','40','42','44']) v;
  end if;

  if not exists (select 1 from fin_cost_objects where entity_id = hw and name = 'B-Line fin') then
    insert into fin_cost_objects (entity_id, kind, name, parent_id, sort, note)
      values (hw, 'range', 'B-Line fin', fins, 22,
              'Made in China. Quantities and prices still to be agreed.')
      returning id into bline;
    insert into fin_cost_objects (entity_id, kind, name, parent_id, sort)
    select hw, 'size', 'B-Line ' || v, bline, 420 + row_number() over ()
      from unnest(array['30','32','34','36','38','40','42','44']) v;
  end if;

  -- the two board lines carry their construction, because that is the cost
  select id into slalom   from fin_cost_objects where entity_id = hw and name = 'Slalom'   and parent_id = boards;
  select id into freerace from fin_cost_objects where entity_id = hw and name = 'Freerace' and parent_id = boards;
  update fin_cost_objects
     set note = 'High-end honeycomb, made in China. ~650 EUR FOB, ~826 landed.'
   where id = slalom and note is null;
  update fin_cost_objects
     set note = 'Carbon construction. Factory price not yet quoted.'
   where id = freerace and note is null;
end $$;

-- ── The supplier that is already agreed ─────────────────────────────────────
-- Proceed exists. The China factories are deliberately NOT invented here: they
-- are named placeholders so a purchase order can point somewhere, and Nico
-- renames them once the contracts are signed.
insert into hw_suppliers (name, country, currency, notes)
select 'China board factory (name TBC)', 'China', 'EUR',
       'Honeycomb slalom boards, ~650 EUR FOB. Named placeholder until the contract is signed.'
 where not exists (select 1 from hw_suppliers where name like 'China board factory%');

insert into hw_suppliers (name, country, currency, notes)
select 'China fin factory (name TBC)', 'China', 'EUR',
       'NP7 B-Line fins. Quantities and prices to be agreed. Named placeholder.'
 where not exists (select 1 from hw_suppliers where name like 'China fin factory%');
