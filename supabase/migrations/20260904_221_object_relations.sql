-- Migration 221: cost objects stop describing their relations in prose.
--
-- "Made in Germany at Proceed" was a note. A note cannot be joined, filtered or
-- kept honest when the supplier changes, and it cannot answer "what does
-- Proceed cost us this year". The link becomes a foreign key and the note goes
-- back to being commentary.
--
-- `ref_table` / `ref_id` already existed for the record an object stands for;
-- this fills them in and adds the supplier, which is a different relation: what
-- a thing IS versus who MAKES it.
--
-- Idempotent, additive-only.

alter table fin_cost_objects
  add column if not exists supplier_id uuid references hw_suppliers(id) on delete set null;

comment on column fin_cost_objects.supplier_id is
  'Who makes it. Separate from ref_table/ref_id, which is the record this object stands for.';
comment on column fin_cost_objects.ref_id is
  'The row this object stands for, in ref_table. A product, a project, an edition.';

create index if not exists idx_fin_obj_supplier on fin_cost_objects(supplier_id);
create index if not exists idx_fin_obj_ref on fin_cost_objects(ref_table, ref_id);

do $$
declare
  hw uuid; proceed uuid; china_boards uuid; china_fins uuid; rockstar_product uuid;
begin
  select id into hw from fin_entities where key = 'np7-hardware';
  if hw is null then return; end if;

  select id into proceed      from hw_suppliers where name ilike 'Proceed%' limit 1;
  select id into china_boards from hw_suppliers where name ilike 'China board factory%' limit 1;
  select id into china_fins   from hw_suppliers where name ilike 'China fin factory%' limit 1;
  select id into rockstar_product from hw_products where name ilike '%Rockstar%' limit 1;

  -- who makes what
  update fin_cost_objects set supplier_id = proceed
   where entity_id = hw and name = 'Rockstar fin' and supplier_id is null;
  update fin_cost_objects set supplier_id = china_fins
   where entity_id = hw and name = 'B-Line fin' and supplier_id is null;
  update fin_cost_objects set supplier_id = china_boards
   where entity_id = hw and name in ('Slalom', 'Freerace', 'Freeride') and supplier_id is null;

  -- a size inherits its range's supplier unless it says otherwise
  update fin_cost_objects child set supplier_id = parent.supplier_id
    from fin_cost_objects parent
   where child.parent_id = parent.id and child.supplier_id is null
     and parent.supplier_id is not null and child.entity_id = hw;

  -- the Rockstar cost object and the Rockstar product are the same thing
  if rockstar_product is not null then
    update fin_cost_objects
       set ref_table = 'hw_products', ref_id = rockstar_product
     where entity_id = hw and name = 'Rockstar fin' and ref_id is null;
  end if;
end $$;
