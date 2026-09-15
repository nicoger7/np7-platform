-- ============================================================
-- 20260915_247_bank_transfer.sql
--
--   ⚠ WRITTEN, NOT APPLIED. Three preconditions, all named at the bottom.
--
--   A German guest presses Pay and gets an IBAN that is theirs alone. They
--   transfer from their own banking app, Stripe matches it, and the booking,
--   the payment row and the invoice settle themselves. Today that guest gets
--   no button at all: card is the only thing Stripe would show them, a
--   surcharge on a private EEA card is forbidden (§270a BGB), and NP7 will not
--   carry ~1.5 %. A SEPA credit transfer costs cents, works in every euro
--   country, and cannot be charged back.
--
--   Stripe calls the method `customer_balance`. Two facts about it drive
--   everything below:
--
--     1. THE IBAN BELONGS TO A STRIPE CUSTOMER, not to a payment. Reusing the
--        same Customer for the same human is what makes their account number
--        stable across bookings, so the id has to be anchored and never
--        reassigned. Part (a).
--     2. THE MONEY TAKES DAYS. A Checkout Session lives 30 minutes to 24 hours;
--        the payment lives for one to three working days and sometimes longer.
--        exp_payment_links.expires_at conflated the two, so on day two an
--        in-flight transfer simply fell out of the "still live" filter and the
--        guest could start a second one for the same money. Part (c) splits the
--        clocks and gives the row the states it needs in between.
--
--   (a) contacts.stripe_customer_id — THE COLUMN ALREADY EXISTS, since
--   20260611_016_member_area.sql line 9, and /api/reserve already writes it.
--   Nothing here adds it. What was missing is the uniqueness that makes it safe
--   to hang a shared IBAN off: two contact rows holding one Customer id would
--   pool two people's transfers into one cash balance for Stripe to reconcile
--   by amount alone.
--
--   (b) merge_contacts() — THE SHARPEST THING IN THIS FILE, and two edits that
--   only work together. The function gap-fills the survivor from the doomed
--   row (phone, location, country, date_of_birth, email2) and does NOT carry
--   stripe_customer_id, so merging a contact today orphans its Customer, its
--   IBAN and any cash balance on a row nobody reads again. But the merge
--   ARCHIVES the doomed contact rather than deleting it, so gap-filling alone
--   would leave BOTH rows holding the same id and the partial unique index
--   from (a) would abort every merge of two Customer-bearing contacts. So the
--   survivor gains the id and the doomed row's copy is nulled in the same
--   statement block. Both edits or neither.
--
--   The original value is preserved in contact_merges.merged_snapshot.
--   unmerge_contacts() un-archives but does not restore gap-filled columns,
--   which is already true of phone and country today; a resurrected contact
--   simply earns a fresh Customer on demand, and its old PaymentIntents stay
--   findable by intent id, which is what every report and every dedupe in this
--   codebase keys on anyway.
--
--   (c) exp_payment_links — the two clocks, and the states between open and
--   paid. See the column comments; they carry the reasoning rather than
--   repeating the shape.
--
--   BEFORE APPLYING:
--   1. Check nothing already shares a Customer id, or the unique index will
--      refuse to build:
--        select stripe_customer_id, count(*) from contacts
--         where stripe_customer_id is not null
--         group by 1 having count(*) > 1;
--      Any row that comes back is two contact rows for one human. Merge them
--      (after this function is in place) rather than nulling one at random.
--   2. Rehearse a merge of two Customer-bearing contacts on a copy. A merge
--      that aborts on the new unique index is a worse failure than the orphan
--      it prevents, and the two edits in (b) are what stop it.
--   3. STRIPE_BANK_TRANSFER_ENABLED stays unset until identity verification is
--      done on the Stripe account. The schema is inert without it: every
--      column below is nullable or defaulted, and with the flag off the code
--      never writes them.
--
--   Additive and idempotent. The index build takes a brief lock on contacts,
--   which is in the low thousands of rows.
-- ============================================================

-- ── (a) One Customer, one contact ────────────────────────────────────────────

create unique index if not exists uniq_contact_stripe_customer
  on contacts (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column contacts.stripe_customer_id is
  'The Stripe Customer this person pays as. It anchors their bank-transfer IBAN, which is issued per Customer, so the same value must come back for the same human on every booking. Never reassign it to another contact: money already sent to that virtual account would reconcile against the wrong person.';

-- ── (b) A merge must carry the Customer, and may only carry it once ──────────

create or replace function merge_contacts(p_survivor uuid, p_merged uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  u record;
  moved jsonb := '[]'::jsonb;
  dropped jsonb := '[]'::jsonb;
  pkcols text[];
  gone jsonb;
  pred text;
  snap jsonb;
  surv contacts%rowtype;
begin
  if p_survivor = p_merged then
    raise exception 'survivor and merged are the same contact';
  end if;
  select * into surv from contacts where id = p_survivor;
  if not found then raise exception 'survivor contact not found'; end if;
  select to_jsonb(c) into snap from contacts c where c.id = p_merged;
  if snap is null then raise exception 'merged contact not found'; end if;

  -- Never lose an address.
  insert into contact_emails (contact_id, email, source)
  select p_survivor, e, 'merge:' || p_merged
  from (
    select distinct lower(trim(x)) as e
    from unnest(array[snap->>'email', snap->>'email2', surv.email, surv.email2]) as x
  ) t
  where e is not null and e <> ''
  on conflict (contact_id, email) do nothing;

  -- Fill the survivor's gaps; never overwrite what it already has.
  --
  -- stripe_customer_id joins this list so a merge stops orphaning the Customer
  -- that holds this person's IBAN and any unapplied cash balance on it. It is
  -- the one gap-filled column that is also UNIQUE, which is why the doomed
  -- row's copy has to go in the same breath — see the archive update below.
  update contacts set
    phone              = coalesce(phone, snap->>'phone'),
    location           = coalesce(location, snap->>'location'),
    country            = coalesce(country, snap->>'country'),
    date_of_birth      = coalesce(date_of_birth, (snap->>'date_of_birth')::date),
    email2             = coalesce(email2, nullif(snap->>'email', email)),
    stripe_customer_id = coalesce(stripe_customer_id, snap->>'stripe_customer_id')
  where id = p_survivor;

  for r in
    select con.conrelid::regclass::text as tbl, att.attname as col
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.contype = 'f'
      and con.confrelid = 'contacts'::regclass
      and con.conrelid not in ('contact_merges'::regclass, 'contact_emails'::regclass)
  loop
    -- Any unique constraint on this table that includes the FK column turns a
    -- blind UPDATE into an abort. Clear the colliding rows first: same person,
    -- same spot, same rating slot — the merged side's copy is redundant.
    for u in
      select array_agg(quote_ident(a.attname)) filter (where a.attname <> r.col) as others
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = r.tbl::regclass
        and c.contype in ('u', 'p')
        and r.col = any (select att2.attname from pg_attribute att2
                         where att2.attrelid = c.conrelid and att2.attnum = any (c.conkey))
      group by c.oid
    loop
      if u.others is not null and array_length(u.others, 1) > 0 then
        pred := (select string_agg(format('a.%1$s is not distinct from b.%1$s', o), ' and ')
                 from unnest(u.others) o);
        execute format(
          'with doomed as (delete from %1$s a where a.%2$I = $1 and exists ('
          || 'select 1 from %1$s b where b.%2$I = $2 and %3$s) returning a.*) '
          || 'select coalesce(jsonb_agg(to_jsonb(doomed)), ''[]''::jsonb) from doomed',
          r.tbl, r.col, pred)
          into gone using p_merged, p_survivor;
        if jsonb_array_length(gone) > 0 then
          dropped := dropped || jsonb_build_object('table', r.tbl, 'column', r.col, 'rows', gone);
        end if;
      end if;
    end loop;

    -- Now the move is safe. Record WHICH rows moved, by primary key — not by
    -- an "id" column, which contact_milestones (PK: contact_id + milestone_id)
    -- and any future join table simply do not have.
    select coalesce(array_agg(a.attname), '{}')
      into pkcols
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.conrelid = r.tbl::regclass and c.contype = 'p';

    execute format(
      'with m as (update %1$s t set %2$I = $1 where %2$I = $2 returning t.*) '
      || 'select coalesce(jsonb_agg(to_jsonb(m)), ''[]''::jsonb) from m', r.tbl, r.col)
      into gone using p_survivor, p_merged;
    if jsonb_array_length(gone) > 0 then
      moved := moved || jsonb_build_object(
        'table', r.tbl, 'column', r.col, 'pk', to_jsonb(pkcols), 'rows', gone);
    end if;
  end loop;

  insert into contact_merges (survivor_id, merged_id, merged_snapshot, moved)
  values (p_survivor, p_merged, snap,
          jsonb_build_object('moved', moved, 'dropped', dropped));

  -- The doomed contact is archived, not deleted, so it is still a row in this
  -- table. Its Customer id is nulled here because uniq_contact_stripe_customer
  -- would otherwise see the gap-fill above as a second row holding the same id
  -- and abort the whole merge. The value is not lost: merged_snapshot has it,
  -- and it is now the survivor's.
  update contacts
  set archived_at = coalesce(archived_at, now()),
      stripe_customer_id = null,
      notes = trim(coalesce(notes, '') || e'\n[merged into ' || p_survivor || ' on ' || now()::date || ']')
  where id = p_merged;

  return jsonb_build_object('survivor', p_survivor, 'merged', p_merged,
                            'moved', moved, 'dropped', dropped);
end
$$;

revoke execute on function merge_contacts(uuid, uuid) from public, anon, authenticated;

-- ── (c) The link row learns the second clock ────────────────────────────────

alter table exp_payment_links
  add column if not exists method             text,
  add column if not exists amount_received    numeric(12,2) not null default 0,
  add column if not exists awaiting_since     timestamptz,
  add column if not exists funds_due_by       timestamptz,
  add column if not exists instructions_url   text,
  add column if not exists transfer_reference text,
  add column if not exists iban_last4         text;

-- open → awaiting → (part_funded) → paid, plus the two ways it can end badly.
-- 'awaiting' is the entire answer to "a guest who transfers on day two must not
-- fight a cancelled row": on day two the row is not open, so no expiry applies
-- to it and nothing sweeps it.
alter table exp_payment_links drop constraint if exists exp_payment_links_status_check;
alter table exp_payment_links
  add constraint exp_payment_links_status_check
  check (status in ('open', 'awaiting', 'part_funded', 'paid', 'expired', 'cancelled', 'failed'));

create index if not exists exp_payment_links_live_idx on exp_payment_links (booking_id, status);

comment on column exp_payment_links.expires_at is
  'WHEN THE CHECKOUT URL DIES, and nothing else. 30 minutes for an instant rail or a card, 23 hours for a transfer (Stripe caps a session at 24). It is NOT the window to pay: a transfer takes one to three working days and its row is ''awaiting'' by then, outside every expiry test. Do not write a sweeper on this column.';
comment on column exp_payment_links.method is
  'rail | card | transfer — the same vocabulary as PayKind in payment-methods.ts. Null on rows made before transfers existed. A transfer must carry fee = 0: §270a BGB bans a surcharge on a SEPA credit transfer outright.';
comment on column exp_payment_links.amount_received is
  'What Stripe says has landed against THIS link''s PaymentIntent, named after Stripe''s own field. A short transfer is visible here and nowhere else: it is NOT written to exp_payments, because money sitting in a cash balance has been applied to nothing and is not revenue.';
comment on column exp_payment_links.awaiting_since is
  'When the guest submitted and Stripe issued the IBAN. The clock that matters starts here, not when the page was opened.';
comment on column exp_payment_links.funds_due_by is
  'awaiting_since + TRANSFER_DUE_DAYS. Ours, not Stripe''s. A row still at amount_received = 0 past this date is swept lazily by the pay route so the guest is not blocked forever by their own abandoned attempt. A row with any money against it is never swept.';
comment on column exp_payment_links.transfer_reference is
  'The reference Stripe told the guest to quote on the transfer. NOT exp_payments.reference, which is the PaymentIntent id.';
comment on column exp_payment_links.iban_last4 is
  'Enough for the guest to recognise the account on their statement, useless to anyone else. The full IBAN and BIC are deliberately not stored: they are Stripe''s virtual account for that Customer and can be rotated, so a stored copy is a stale copy waiting to send somebody''s money to the wrong place.';
