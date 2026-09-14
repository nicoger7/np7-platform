-- A card fee that should never have been charged, given back.
--
-- The admin picks a fee bucket before anyone has seen the card. Stripe reports
-- the card's issuing country and brand on the charge, so the guess can be
-- checked afterwards, and a fee charged on a card §270a protects is refunded on
-- the spot. These columns are the record of that: when it went back, and why.
alter table exp_payment_links
  add column if not exists fee_refunded_at timestamptz,
  add column if not exists fee_refund_reason text,
  add column if not exists card_country text,
  add column if not exists card_brand text;

comment on column exp_payment_links.fee_refunded_at is
  'Set when the card fee was refunded because the card turned out to be one a surcharge may not stand on (§270a BGB). The amount and fee columns keep what was originally charged.';
comment on column exp_payment_links.card_country is
  'Issuing country Stripe reported on the charge, ISO-3166 alpha-2. The thing the fee bucket was guessing at.';
