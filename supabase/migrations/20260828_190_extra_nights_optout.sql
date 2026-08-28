-- ============================================================================
-- 190 — Extra nights in your own room become opt-OUT.
--
-- Nico, 2026-08-28: "grundsätzlich sollte jedes Zimmer angefragt werden können
-- für zusätzliche Daten vom Kunden. Außer wir deaktivieren es aktiv."
--
-- Until now every offer was opt-in via addon_available, and the flag had only
-- ever been set for Alaçatı and Tenerife. Bonaire — three upcoming weeks, forty
-- guests — could not ask for a single extra night, not by decision but because
-- nobody ticked a box.
--
-- Asking to stay longer in the room you are ALREADY in is the default now. It
-- is the one add-on where the price, the hotel and the room are already known,
-- so there is nothing to configure and nothing to get wrong. Everything else
-- (gear, transfers, upgrades) stays opt-in through addon_available.
--
-- The opt-out is deliberately its own column rather than an inverted
-- addon_available: that flag still means "offer this generic extra", and
-- overloading it would make "false" mean two different things.
-- ============================================================================

alter table exp_components
  add column if not exists extra_nights_blocked boolean not null default false;

comment on column exp_components.extra_nights_blocked is
  'Opt-OUT for per-night room components: a component carrying hotel_id + room_type is offered to guests in that room automatically. Set true when a hotel genuinely cannot extend a stay. Has no effect on components without a room link — those follow addon_available.';
