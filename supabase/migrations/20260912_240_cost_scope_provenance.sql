-- 240 · A cost says where it belongs, and whether its money is real
--
-- Nico, 2026-09-12: "we need a clear filter for real costs and expected costs.
-- and then we should be able to allocate costs to an edition (or shared to an
-- experience in a specific year) or general. or general to a year. we want to
-- incentivise allocating to an edition."
--
-- What was here before this ran, verified against the live table:
--   · 244 cost lines, every one of them pinned to an edition. experience_id
--     was NOT NULL, so a cost that belongs to no single trip had nowhere to
--     live. The only "shared" idea, the % split of migration 056, has zero
--     rows; the payment attachments of migration 057 have zero rows too.
--   · "Real" meant a number someone typed into actual_amount (155 rows). The
--     bank ledger of migration 233 holds 371 debits and none of them can be
--     tied to a cost line, so nothing in the cost world is provable.
--
-- Three things are added, and no amount anywhere changes.
--
-- ── 1. SCOPE: where a cost belongs ──────────────────────────────────────────
--
--   edition          one trip. The default, and the only scope every reader
--                    understands without help. edition_id + experience_id set,
--                    year null (the edition knows its year).
--   experience_year  shared across the trips of one experience in one year,
--                    e.g. a coach's flight that covers three Bonaire weeks.
--                    experience_id + year set, edition_id null.
--   year             belongs to a year and to no experience: gear bought for
--                    the whole 2027 season. year set, nothing else.
--   general          belongs to nothing in particular: office, software.
--                    Nothing set.
--
-- The CHECK below makes any other combination impossible, so a reader can
-- trust the column instead of re-deriving it from which ids happen to be set.
--
-- The rules every reader follows from now on. Write them here once, so the
-- P&L, the § 25 record and the budget board never disagree about a euro:
--
--   · The edition P&L (/api/admin/editions/[id]/pnl) counts a cost only when
--     it is edition-scoped (edition_id = this edition) or reaches the edition
--     through an explicit % row in exp_cost_allocations. A shared, yearly or
--     general cost NEVER lands on a trip by itself. Splitting is the one way
--     in, and it is a decision someone makes.
--   · The § 25 Abs. 5 record (src/lib/lexoffice/margin.ts) needs the
--     Reisevorleistungen PER TRIP. A travel input therefore has to be
--     edition-scoped or split by % onto editions to count; one that sits on
--     an experience_year or year scope without a split is reported as
--     "travel input not yet assigned to a trip", never silently dropped and
--     never silently spread. A GENERAL cost can never be a travel input at
--     all: a Reisevorleistung is by definition bought FOR a trip (PDF page 8:
--     "kommt die Leistung von einem Dritten und direkt beim Gast an?"), and
--     the CHECK refuses the combination.
--   · The budget board (src/lib/finance/sources.ts) reads a cost into the
--     year it belongs to: by its own date, else its edition's start, else the
--     year column. A general cost with no date belongs to no year and stays
--     visibly stranded rather than being filed somewhere.
--   · The experience Costs tab (/api/admin/experiences/[id]) lists everything
--     carrying that experience_id, so edition and experience_year rows both
--     show there; year and general rows only on /admin/exp-costs.
--
-- The incentive to pick an edition is not a trick: edition is the default and
-- the one-click choice, and choosing anything broader requires a short reason
-- ("why not one trip?") which is stored in scope_reason and shown beside the
-- cost. That reason is what the accountant, and Nico in six months, will want.
--
-- ── 2. PROVENANCE: is the actual real? ──────────────────────────────────────
--
-- Mirrors exp_payments.provenance (migration 235). A cost's money is one of:
--
--   real       bank-backed. A bank_transactions debit was allocated to this
--              line: an exp_payments row with direction='cost',
--              provenance='bank' and bank_transaction_id, attached through
--              exp_cost_payment_allocations. DERIVED from those rows, never
--              stored here, so it cannot drift from the ledger.
--   hand       actual_amount typed by a person. actual_provenance says how
--              honest that number is:
--                off_bank    recorded on purpose, WITH a note, because the
--                            money never shows in Qonto: Nico's private card,
--                            cash, an offset. Staff time from the hours log
--                            is stamped this way by the trigger, because it
--                            is valued from a rate and is never a bank line.
--                unverified  the 155 legacy rows. Not wrong, not yet decided.
--   expected   neither. The estimate is all there is.
--
-- The CHECKs tie the two together: a typed actual always carries a
-- provenance, an untyped one never does, and off_bank needs its note, exactly
-- as 235 refuses an off_bank payment without a reason.
--
-- ── 3. UNPLANNED ────────────────────────────────────────────────────────────
--
-- A real debit that matches no expected item still has to be allocated. Then
-- a cost line is created from the debit itself, status confirmed, and marked
-- unplanned so the expected-versus-real view can say "this was never
-- budgeted" instead of quietly counting it as if it had been.
--
-- Additive and reversible. Rollback, should it ever be needed:
--   drop trigger exp_costs_guard_trg on exp_costs; drop function exp_costs_guard();
--   alter table exp_costs drop constraint exp_costs_scope_check, drop constraint
--     exp_costs_scope_coherent, drop constraint exp_costs_scope_needs_reason,
--     drop constraint exp_costs_travel_input_needs_trip, drop constraint
--     exp_costs_actual_provenance_check, drop constraint exp_costs_actual_has_provenance,
--     drop constraint exp_costs_off_bank_needs_note, drop constraint exp_costs_year_sane;
--   alter table exp_costs drop column scope, drop column year, drop column scope_reason,
--     drop column actual_provenance, drop column actual_note, drop column unplanned;
--   alter table exp_costs alter column experience_id set not null;  -- while no non-edition row exists
-- Nothing in this file touches estimated_amount or actual_amount.

-- ── columns ───────────────────────────────────────────────────────────────────

alter table exp_costs alter column experience_id drop not null;

alter table exp_costs
  add column if not exists scope             text not null default 'edition',
  add column if not exists year              integer,
  add column if not exists scope_reason      text,
  add column if not exists actual_provenance text,
  add column if not exists actual_note       text,
  add column if not exists unplanned         boolean not null default false;

-- ── backfill, before the constraints so every existing row already obeys them ─

-- All 244 rows are edition costs; the column default has already said so.
-- A typed actual is honestly "not yet decided" ...
update exp_costs
   set actual_provenance = 'unverified'
 where actual_amount is not null
   and actual_provenance is null;

-- ... except staff time from the hours log, which is valued from an hourly
-- rate and will never appear as a bank line of its own. Same narrow rule as
-- migration 237: the item strings are the ones src/lib/hours-cost.ts writes.
update exp_costs
   set actual_provenance = 'off_bank',
       actual_note = coalesce(nullif(btrim(actual_note), ''),
                              'Staff time from the hours log, valued at the hourly rate. Never a bank line of its own.')
 where actual_amount is not null
   and actual_provenance = 'unverified'
   and (item like 'Labour%' or item like 'Overhead labour%');

-- ── constraints ───────────────────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exp_costs_scope_check') then
    alter table exp_costs add constraint exp_costs_scope_check
      check (scope in ('edition', 'experience_year', 'year', 'general'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'exp_costs_scope_coherent') then
    alter table exp_costs add constraint exp_costs_scope_coherent check (
         (scope = 'edition'         and edition_id is not null and experience_id is not null and year is null)
      or (scope = 'experience_year' and edition_id is null     and experience_id is not null and year is not null)
      or (scope = 'year'            and edition_id is null     and experience_id is null     and year is not null)
      or (scope = 'general'         and edition_id is null     and experience_id is null     and year is null)
    );
  end if;

  -- Anything broader than one trip has to say why. This is the incentive,
  -- expressed as a constraint rather than a pop-up.
  if not exists (select 1 from pg_constraint where conname = 'exp_costs_scope_needs_reason') then
    alter table exp_costs add constraint exp_costs_scope_needs_reason
      check (scope = 'edition' or coalesce(btrim(scope_reason), '') <> '');
  end if;

  -- A Reisevorleistung is bought for a trip. A cost that belongs to no
  -- experience and no year cannot be one.
  if not exists (select 1 from pg_constraint where conname = 'exp_costs_travel_input_needs_trip') then
    alter table exp_costs add constraint exp_costs_travel_input_needs_trip
      check (margin_class is distinct from 'travel_input' or scope <> 'general');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'exp_costs_actual_provenance_check') then
    alter table exp_costs add constraint exp_costs_actual_provenance_check
      check (actual_provenance is null or actual_provenance in ('off_bank', 'unverified'));
  end if;

  -- A typed actual always says where it came from; nothing typed, nothing said.
  if not exists (select 1 from pg_constraint where conname = 'exp_costs_actual_has_provenance') then
    alter table exp_costs add constraint exp_costs_actual_has_provenance
      check ((actual_amount is null) = (actual_provenance is null));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'exp_costs_off_bank_needs_note') then
    alter table exp_costs add constraint exp_costs_off_bank_needs_note
      check (actual_provenance is distinct from 'off_bank' or coalesce(btrim(actual_note), '') <> '');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'exp_costs_year_sane') then
    alter table exp_costs add constraint exp_costs_year_sane
      check (year is null or year between 2000 and 2100);
  end if;
end $$;

-- ── the guard: fill what can be derived, refuse what contradicts ─────────────
--
-- BEFORE ROW, so it runs ahead of the CHECKs above. Three jobs:
--   1. an edition cost carries its edition's experience. Filled in when
--      missing (the hours-log cron and the edition page both know only the
--      edition), refused when it names a different one.
--   2. a typed actual gets a provenance if the writer gave none, and the
--      hours-log rows get off_bank with their note, so every writer of
--      actual_amount, including code that has never heard of this column,
--      leaves the row consistent.
--   3. a reason only means something off the edition; moving a cost back
--      onto one trip clears the stale one.

create or replace function exp_costs_guard() returns trigger
language plpgsql as $$
declare
  v_exp uuid;
begin
  if new.scope = 'edition' and new.edition_id is not null then
    select experience_id into v_exp from exp_editions where id = new.edition_id;
    if new.experience_id is null then
      new.experience_id := v_exp;
    elsif v_exp is not null and new.experience_id <> v_exp then
      raise exception 'exp_costs: edition % belongs to experience %, not %', new.edition_id, v_exp, new.experience_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.actual_amount is null then
    new.actual_provenance := null;
  else
    if new.actual_provenance is null then
      new.actual_provenance := 'unverified';
    end if;
    if new.actual_provenance = 'unverified'
       and (new.item like 'Labour%' or new.item like 'Overhead labour%') then
      new.actual_provenance := 'off_bank';
      new.actual_note := coalesce(nullif(btrim(new.actual_note), ''),
        'Staff time from the hours log, valued at the hourly rate. Never a bank line of its own.');
    end if;
  end if;

  if new.scope = 'edition' then
    new.scope_reason := null;
  end if;

  return new;
end $$;

drop trigger if exists exp_costs_guard_trg on exp_costs;
create trigger exp_costs_guard_trg
  before insert or update on exp_costs
  for each row execute function exp_costs_guard();

-- ── indexes: the filters the costs page asks for ─────────────────────────────

create index if not exists exp_costs_scope_idx on exp_costs (scope);
create index if not exists exp_costs_year_idx  on exp_costs (year) where year is not null;
create index if not exists exp_costs_experience_year_idx on exp_costs (experience_id, year) where scope = 'experience_year';
create index if not exists exp_costs_unplanned_idx on exp_costs (unplanned) where unplanned;

-- ── say what the columns mean, where the next reader will look ──────────────

comment on column exp_costs.scope is
  'edition = one trip (default) · experience_year = shared across one experience''s trips in a year · year = a season, no experience · general = belongs to nothing. A non-edition cost reaches a trip only through exp_cost_allocations.';
comment on column exp_costs.year is
  'Set for experience_year and year scopes only. An edition cost takes its year from the edition.';
comment on column exp_costs.scope_reason is
  'Required off the edition scope: why this cost is not one trip''s.';
comment on column exp_costs.actual_provenance is
  'How a typed actual_amount is known: off_bank = recorded on purpose with actual_note, money this system cannot see · unverified = legacy, not yet decided. Bank-backed money is not stored here, it is derived from the attached exp_payments rows with provenance=bank.';
comment on column exp_costs.unplanned is
  'Created from a real bank debit that matched no expected item. Real money that was never budgeted.';
