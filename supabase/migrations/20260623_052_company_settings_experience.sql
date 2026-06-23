-- 052: Seed the Experience division's company settings (the invoice issuer).
-- DATA, not schema — an idempotent upsert you can re-run safely; afterwards it's
-- editable in the admin under Company Settings. Details from the live invoice:
-- Surfcenter Experience B.V. (NL), travel margin scheme (no VAT shown separately;
-- the invoice template prints the Art. 306–310 note automatically for vat_mode='margin').
-- Requires migration 021 (company_settings table).

insert into company_settings
  (division, legal_name, address_line1, postal_code, city, country,
   email, phone, vat_id, register_info, iban, bic, bank_name,
   currency, vat_mode, invoice_prefix)
values
  ('experience', 'Surfcenter Experience B.V.', 'Roegeweg 1', '9629 PA', 'Steendam', 'Netherlands',
   'contact@surfcenter-experience.com', '+31 85 048 1281', 'NL869022830B01', 'KvK 99516632',
   'NL41ABNA0155241338', 'ABNANL2A', 'ABN AMRO Bank N.V.',
   'EUR', 'margin', 'SCXP')
on conflict (division) do update set
  legal_name     = excluded.legal_name,
  address_line1  = excluded.address_line1,
  postal_code    = excluded.postal_code,
  city           = excluded.city,
  country        = excluded.country,
  email          = excluded.email,
  phone          = excluded.phone,
  vat_id         = excluded.vat_id,
  register_info  = excluded.register_info,
  iban           = excluded.iban,
  bic            = excluded.bic,
  bank_name      = excluded.bank_name,
  currency       = excluded.currency,
  vat_mode       = excluded.vat_mode,
  invoice_prefix = excluded.invoice_prefix;
