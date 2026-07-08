-- 072 · SECURITY: enable Row-Level Security on three exposed tables
--
-- The Supabase advisor flagged `rls_disabled_in_public` (2026-07-08). Verified
-- independently with the public anon key: an anon INSERT got PAST RLS (400
-- constraint error, not a 401 security block) on:
--   • exp_editions   — trip dates/editions (read anon on public experience pages)
--   • hotels         — hotel records (server + admin only)
--   • spot_edits     — member spot suggestions (server + admin only; has contact_id)
-- i.e. anyone with the public anon key could insert / update / DELETE these rows.
--
-- Fix: enable RLS + a SELECT policy that matches how the app actually reads each
-- table. All WRITES already go through the service-role client (admin + portal
-- API routes), which BYPASSES RLS — so no legitimate write path breaks.
--
-- Re-runnable (drop policy if exists). Apply in the Supabase SQL editor.

-- exp_editions: public experience pages read editions via an embedded join → keep public read.
alter table exp_editions enable row level security;
drop policy if exists "public_read_editions" on exp_editions;
create policy "public_read_editions" on exp_editions for select using (true);

-- hotels: public-safe fields (name, address, photos); RLS-off already exposed reads → keep read, block writes.
alter table hotels enable row level security;
drop policy if exists "public_read_hotels" on hotels;
create policy "public_read_hotels" on hotels for select using (true);

-- spot_edits: server-managed. Restrict SELECT to logged-in members (also closes the
-- pre-existing anon exposure of contact_id); service role still bypasses for the crons/APIs.
alter table spot_edits enable row level security;
drop policy if exists "members_read_spot_edits" on spot_edits;
create policy "members_read_spot_edits" on spot_edits for select to authenticated using (true);
