-- Migration 212: two businesses to plan, not three companies to choose between.
--
-- The holding was in the list because it is the company that legally issues
-- Experience invoices today. But nobody budgets a holding: you budget the trips
-- and you budget the boards. Carrying it as a third option only asked the
-- question "which of these am I in" every time.
--
-- So an entity here is a BUSINESS, and `legal_name` is whichever GmbH currently
-- carries it. That makes the 2027 handover a non-event for planning: the
-- Experience budget runs straight through it and only the legal name changes.
--
-- Safe: checked before writing, no plans or actuals referenced the holding.

alter table fin_entities
  add column if not exists own_entity_from date;

comment on column fin_entities.legal_name is
  'The GmbH that carries this business right now. Experience sits inside NP7 GmbH until its own company takes over.';
comment on column fin_entities.own_entity_from is
  'When this business gets its OWN legal entity. Null means it already has one, or the date is not set.';
comment on column fin_entities.status is
  'active = trading now. planned = not founded or not trading yet.';

-- Experience trades today, inside the holding, and becomes its own GmbH in 2027.
update fin_entities set
  legal_name       = 'NP7 GmbH',
  status           = 'active',
  own_entity_from  = '2027-01-01',
  active_from      = null,
  role             = 'operating',
  note             = 'Trading now, inside NP7 GmbH. Its own company, NP7 Experience GmbH, takes over on 2027-01-01.',
  sort             = 1,
  updated_at       = now()
 where key = 'np7-experience';

-- Hardware is being founded and is not trading yet.
update fin_entities set
  status          = 'planned',
  active_from     = null,
  note            = 'Being founded. Legal name still undecided: NP7 Group GmbH or NP7 Hardware GmbH.',
  sort            = 2,
  updated_at      = now()
 where key = 'np7-hardware';

-- The holding is not a thing anyone budgets. Dropped rather than archived: it
-- carried no plans and no actuals, so there is no history to keep. If holding
-- level planning is ever wanted (management fees, participations) it comes back
-- as its own row with division NULL, which no world offers.
delete from fin_entities where key = 'np7-gmbh';
