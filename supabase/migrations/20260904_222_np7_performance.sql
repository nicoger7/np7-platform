-- Migration 222: the hardware company has a name, and it is registered.
--
-- Nico, 2026-09-04: "We registered the GmbH as NP7 Performance." That settles
-- the question 220 left open (NP7 Group GmbH or NP7 Hardware GmbH) and it also
-- changes its status: this is no longer a company being founded, it exists.
--
-- The KEY stays 'np7-hardware' and the division stays 'hardware'. Those are
-- identifiers that the world switcher, the category split, the public /hardware
-- routes and the SHOW_HARDWARE flag all key on; renaming them would be a rename
-- of the plumbing to match a label. The name is what changed.

update fin_entities
   set name            = 'NP7 Performance',
       legal_name      = 'NP7 Performance GmbH',
       status          = 'active',
       own_entity_from = null,
       active_from     = coalesce(active_from, current_date),
       note            = 'Registered as NP7 Performance GmbH. Trades as the hardware side: boards and fins.',
       updated_at      = now()
 where key = 'np7-hardware';
