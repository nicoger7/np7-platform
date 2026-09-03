-- Migration 216: what was the money FOR.
--
-- Categories say what KIND of cost something is (freight, salaries, moulds).
-- They cannot answer "what did the Slalom 72 cost us and what did it earn",
-- because a mould, a container of freight and a shaper's month all land in
-- different categories while belonging to the same board.
--
-- A COST OBJECT is the thing money is spent on and earned from: a range, a
-- size, a project, a trip. Objects nest, so Boards > Slalom > Slalom 72 rolls
-- up on its own. Both a planned line and a recorded cost are allocated to
-- objects by SHARE, because a container of freight carrying three ranges
-- belongs to all three and to none of them alone.
--
-- Idempotent, additive-only.

create table if not exists fin_cost_objects (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid references fin_entities(id) on delete cascade,
  kind        text not null,              -- range | size | product | project | edition | overhead
  name        text not null,
  parent_id   uuid references fin_cost_objects(id) on delete set null,
  -- Optional pointer at the record this object stands for, so a size can be
  -- tied to a real variant once the catalogue has one. Deliberately not a
  -- foreign key: it points at different tables.
  ref_table   text,
  ref_id      uuid,
  note        text,
  sort        int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_fin_obj_entity on fin_cost_objects(entity_id, kind);
create index if not exists idx_fin_obj_parent on fin_cost_objects(parent_id);

-- ── planned line → object ────────────────────────────────────────────────────
create table if not exists fin_line_objects (
  id             uuid primary key default gen_random_uuid(),
  plan_line_id   uuid not null references fin_plan_lines(id)  on delete cascade,
  cost_object_id uuid not null references fin_cost_objects(id) on delete cascade,
  share          numeric not null default 100,   -- percent of the line
  created_at     timestamptz not null default now(),
  unique (plan_line_id, cost_object_id)
);
create index if not exists idx_fin_lineobj_line on fin_line_objects(plan_line_id);
create index if not exists idx_fin_lineobj_obj  on fin_line_objects(cost_object_id);

-- ── recorded cost → object ───────────────────────────────────────────────────
create table if not exists fin_actual_objects (
  id             uuid primary key default gen_random_uuid(),
  actual_id      uuid not null references fin_actuals(id)      on delete cascade,
  cost_object_id uuid not null references fin_cost_objects(id) on delete cascade,
  share          numeric not null default 100,
  created_at     timestamptz not null default now(),
  unique (actual_id, cost_object_id)
);
create index if not exists idx_fin_actobj_actual on fin_actual_objects(actual_id);
create index if not exists idx_fin_actobj_obj    on fin_actual_objects(cost_object_id);

alter table fin_cost_objects   enable row level security;
alter table fin_line_objects   enable row level security;
alter table fin_actual_objects enable row level security;

drop policy if exists "fin_cost_objects team" on fin_cost_objects;
create policy "fin_cost_objects team" on fin_cost_objects for all using (is_team_member()) with check (is_team_member());
drop policy if exists "fin_line_objects team" on fin_line_objects;
create policy "fin_line_objects team" on fin_line_objects for all using (is_team_member()) with check (is_team_member());
drop policy if exists "fin_actual_objects team" on fin_actual_objects;
create policy "fin_actual_objects team" on fin_actual_objects for all using (is_team_member()) with check (is_team_member());

-- ── Seed the Hardware tree, from the ranges and sizes the business plan sells ─
do $$
declare
  hw   uuid;
  boards uuid; slalom uuid; freerace uuid; freeride uuid;
  fins uuid; fslalom uuid; ffreerace uuid;
begin
  select id into hw from fin_entities where key = 'np7-hardware';
  if hw is null then return; end if;
  if exists (select 1 from fin_cost_objects where entity_id = hw) then return; end if;

  insert into fin_cost_objects (entity_id, kind, name, sort) values (hw, 'range', 'Boards', 10) returning id into boards;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort) values (hw, 'range', 'Slalom',   boards, 11) returning id into slalom;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort) values (hw, 'range', 'Freerace', boards, 12) returning id into freerace;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort) values (hw, 'range', 'Freeride', boards, 13) returning id into freeride;

  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort)
  select hw, 'size', 'Slalom ' || v, slalom, 100 + row_number() over ()
    from unnest(array['63','67','72','77','82','85','Foil 85']) v;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort)
  select hw, 'size', 'Freerace ' || v, freerace, 200 + row_number() over ()
    from unnest(array['100','110','120','130','145','155']) v;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort)
  select hw, 'size', 'Freeride ' || v, freeride, 300 + row_number() over ()
    from unnest(array['120','130','140']) v;

  insert into fin_cost_objects (entity_id, kind, name, sort) values (hw, 'range', 'Fins', 20) returning id into fins;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort) values (hw, 'range', 'Slalom fins',   fins, 21) returning id into fslalom;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort) values (hw, 'range', 'Freerace fins', fins, 22) returning id into ffreerace;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort)
  select hw, 'size', 'Slalom fin ' || v, fslalom, 400 + row_number() over ()
    from unnest(array['30-40','40-50']) v;
  insert into fin_cost_objects (entity_id, kind, name, parent_id, sort)
  select hw, 'size', 'Freerace fin ' || v, ffreerace, 500 + row_number() over ()
    from unnest(array['small','large']) v;

  -- Anything that keeps the company running and belongs to no product.
  insert into fin_cost_objects (entity_id, kind, name, sort, note)
    values (hw, 'overhead', 'Company', 900,
            'Costs that belong to no single product. Allocate them out by share when you want a fully loaded product cost.');
end $$;
