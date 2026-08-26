-- 182: add-on invoices — the double-billing lock.
-- An interim "Add-on Invoice" bills confirmed extras added after an earlier
-- invoice (down-payment paid, final not due — the guest pays just the extra).
-- Each billed add-on row is stamped with the issuing document; voiding the
-- document clears the stamp. Rows with a stamp are never billed again.
alter table exp_booking_addons
  add column if not exists invoiced_in uuid references documents(id) on delete set null;
