-- Migration 119: seed the 3PL warehouse location (116 seeded the other six;
-- the receive flow and the fulfillment picker both offer 3PL as a target).
insert into hw_stock_locations (code, name, kind, is_virtual)
select '3PL', '3PL warehouse', '3pl', false
where not exists (select 1 from hw_stock_locations where code = '3PL');
