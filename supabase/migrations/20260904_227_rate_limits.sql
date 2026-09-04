-- A counter, so a stranger cannot spend our money in a loop.
--
-- Nothing in this app has ever been rate limited. The one that matters is
-- /api/portal/login: it takes an email address, no session, no bot check, and
-- sends a real message through Resend on every single call. The magic link is
-- minted with auth.admin.generateLink, a service-role call, so Supabase's own
-- auth throttles never see it. Anyone with curl can fill a member's inbox,
-- burn the mail quota and take the sender reputation down with it, and the
-- reputation is the part that does not come back on Monday.
--
-- Why a table and not Redis: Vercel KV is gone as a product, Upstash would be
-- a new account and new secrets for the owner to set up, and Fluid Compute
-- reuses instances without promising two requests land on the same one, so an
-- in-memory counter would leak through under exactly the load it exists for.
-- Postgres is already here, and this only ever runs on endpoints that were
-- talking to it anyway. Nothing on the public site's hot path touches it.
--
-- The window is fixed, not sliding. A sliding window needs a row per hit; this
-- needs one row per caller and answers in a single statement. The cost is that
-- a caller can spend their whole allowance at the end of one window and again
-- at the start of the next. For blocking a flood that is a distinction without
-- a difference.

create table if not exists public.rate_limits (
  bucket        text primary key,
  window_start  timestamptz not null default now(),
  hits          integer     not null default 0
);

comment on table public.rate_limits is
  'One row per caller per endpoint. Written only by rate_limit_hit(); safe to truncate.';

-- Old rows are dead weight, never history. This index is for the sweep.
create index if not exists rate_limits_window_start_idx
  on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;

-- No policy on purpose. RLS with no policy denies everyone, and the only writer
-- is the SECURITY DEFINER function below, which bypasses it. anon and
-- authenticated can neither read who has been calling nor forge a count.

/**
 * Count one hit and say whether it is allowed, in a single round trip.
 *
 * Read-modify-write from the application would race: two requests read 4, both
 * write 5, and the fifth call through a limit of 5 gets served. The insert with
 * on conflict does the whole thing under one row lock, and `returning` hands
 * back the value that was actually stored.
 *
 * Returns allowed=true when this hit is within the limit. retry_after is
 * seconds until the window rolls, for the Retry-After header.
 */
create or replace function public.rate_limit_hit(
  p_bucket         text,
  p_window_seconds integer,
  p_limit          integer
)
returns table (allowed boolean, hits integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now    timestamptz := now();
  v_cutoff timestamptz := now() - make_interval(secs => p_window_seconds);
  v_start  timestamptz;
  v_hits   integer;
begin
  insert into public.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_now, 1)
  on conflict (bucket) do update set
    -- An expired window is not decremented, it is replaced.
    window_start = case when r.window_start < v_cutoff then v_now else r.window_start end,
    hits         = case when r.window_start < v_cutoff then 1    else r.hits + 1  end
  returning r.window_start, r.hits into v_start, v_hits;

  return query select
    v_hits <= p_limit,
    v_hits,
    greatest(0, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
end;
$$;

comment on function public.rate_limit_hit(text, integer, integer) is
  'Atomic fixed-window counter. service_role only.';

-- The function runs as its owner, so who may CALL it is the whole access
-- control. A SECURITY DEFINER function left executable by anon is how the
-- invoice number allocator became something a stranger could drain (migration
-- 164). Not twice.
revoke all on function public.rate_limit_hit(text, integer, integer) from public;
revoke all on function public.rate_limit_hit(text, integer, integer) from anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

/**
 * Drop rows nobody is counting any more. Called opportunistically, so it takes
 * a cheap advisory lock rather than piling up concurrent deletes: if another
 * request is already sweeping, this one returns immediately.
 */
create or replace function public.rate_limit_sweep(p_older_than_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('rate_limit_sweep')) then
    return 0;
  end if;
  delete from public.rate_limits
   where window_start < now() - make_interval(hours => p_older_than_hours);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.rate_limit_sweep(integer) from public;
revoke all on function public.rate_limit_sweep(integer) from anon, authenticated;
grant execute on function public.rate_limit_sweep(integer) to service_role;
