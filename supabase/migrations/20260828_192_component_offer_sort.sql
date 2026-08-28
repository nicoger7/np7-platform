-- Order the extras a guest is offered.
--
-- `offer_at_booking` (migration 184) says an extra may be offered; nothing says
-- in what order. A clinic shows two or three — gear rental, storage, a transfer
-- — and the first one is the one most people take, so the order is a decision
-- someone should be able to make rather than an accident of alphabet.
--
-- Null sorts LAST and then by name, so every existing component keeps today's
-- ordering until someone deliberately types a number.
alter table exp_components
  add column if not exists offer_sort integer;

comment on column exp_components.offer_sort is
  'Order in the booking-time / clinic add-on list. Null = unranked, sorts after ranked ones by name.';
