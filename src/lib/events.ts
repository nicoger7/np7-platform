import { createAdminClient } from "@/lib/supabase";

/** A candidate / confirmed date for a standby (or fixed) event. */
export type EventDate = {
  id: string;
  date_start: string;
  date_end: string | null;
  label: string | null;
  status: "candidate" | "confirmed" | "cancelled";
  max_spots: number | null;
  sort_order: number;
};

export type EventInfo = {
  id: string;
  title: string;
  slug: string;
  location: string | null;
  currency: string | null;
  price: number | null;
  description: string | null;
  hero_image: string | null;
  mode: "fixed" | "standby";
  depositPct: number;
  refundPct: number;
  /** Part-payment terms read off the edition's package (deposit + final due). */
  plan: EventDepositPlan;
  /** The package being sold, so the booking can carry it. */
  packageId: string | null;
  /** The edition being sold — its team, its dates, its copy. */
  editionId: string | null;
  status: string | null;
  websiteVisible: boolean;
  dates: EventDate[];
  /** The edition being sold, when this page is pinned to one. */
  editionSlug?: string | null;
  /** Other upcoming clinics in the same series, for "other dates". */
  siblings?: { slug: string; label: string | null; location: string | null; date_start: string | null; date_end: string | null }[];
};

/**
 * A part-payment ticket: pay the deposit now, the rest before the clinic.
 *
 * This is NOT a new payment model — it is the one every trip already runs, read
 * off the package the way `computePaymentPlan` reads it. Events were built as a
 * separate slim Stripe path (pay 100% now, or a stand-by percentage), so the
 * deposit and "final due N days before" you set on a package did nothing at all
 * on an event: the booking never even carried a `package_id`, and the ticket box
 * priced itself from `event_deposit_pct` instead.
 *
 * So the package is the control now, which is where you would look for it. A
 * package whose deposit is missing, zero, or >= the price simply sells at full
 * price — the old behaviour, unchanged, for every event that has not been
 * given a deposit.
 */
export type EventDepositPlan = {
  /** Charged at checkout. Equals the full price when there is no deposit. */
  dueNow: number;
  /** Left to pay. Zero when the ticket is sold in full. */
  balance: number;
  /** ISO date the balance is due — start − final_days_before. */
  balanceDue: string | null;
  /** True when this is a genuine part-payment rather than a full ticket. */
  partPayment: boolean;
};

export function eventDepositPlan(
  price: number,
  pkg: { deposit: number | null; final_days_before: number | null } | null,
  startDate: string | null,
): EventDepositPlan {
  const full = { dueNow: price, balance: 0, balanceDue: null, partPayment: false };
  if (!pkg) return full;
  const deposit = pkg.deposit == null ? null : Number(pkg.deposit);
  // A deposit at or above the price is not a deposit, it is the ticket.
  if (deposit == null || !(deposit > 0) || deposit >= price) return full;
  const days = pkg.final_days_before ?? 0;
  const balanceDue = startDate
    ? new Date(new Date(`${startDate}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10)
    : null;
  return { dueNow: deposit, balance: Math.round((price - deposit) * 100) / 100, balanceDue, partPayment: true };
}

/**
 * What this booking still owes: the price agreed, less every payment received.
 *
 * The balance page and the balance checkout both used to re-derive it from
 * `event_deposit_pct` — which describes STAND-BY's percentage split and says
 * nothing about a part-payment. On a fixed clinic with the pct left at 100 it
 * computed a balance of zero, so the page said "all paid" and the checkout
 * refused with "nothing left to pay": a rider who had paid €100 of €400 had no
 * way to pay the other €300.
 *
 * Summing what actually landed is both correct for every mode and honest about
 * part payments, refunds and anything settled by hand off-Stripe.
 */
export async function outstandingForBooking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  bookingId: string,
  agreedPrice: number,
): Promise<{ paid: number; outstanding: number }> {
  const { data } = await db
    .from("exp_payments")
    .select("amount, direction, status")
    .eq("booking_id", bookingId);
  const rows = (data ?? []) as { amount: number | string | null; direction: string | null; status: string | null }[];
  const paid = rows
    .filter((r) => r.status === "paid" && r.direction !== "refund")
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  return { paid: Math.round(paid * 100) / 100, outstanding: Math.round((agreedPrice - paid) * 100) / 100 };
}

/** Ticket maths — a single source of truth shared by page, checkout, refunds. */
export function eventPricing(price: number, depositPct: number, refundPct: number) {
  const deposit = Math.round((price * depositPct) / 100); // non-refundable up-front
  const balance = price - deposit;                        // due once a date is confirmed
  const refund = Math.round((price * refundPct) / 100);   // returned if no chosen date runs
  return { deposit, balance, refund, full: price };
}

/**
 * Load an event by slug for the public page (service-role client — event dates
 * are RLS-locked and read only on the server, like packages on the destination
 * page). Returns null for non-event experiences.
 */
export async function getEventForSlug(
  slug: string,
  opts: { includeAllDates?: boolean; editionSlug?: string } = {},
): Promise<EventInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: exp } = await db
    .from("exp_experiences")
    .select("id,title,slug,location,currency,price,description,hero_image,page_template,event_mode,event_deposit_pct,event_refund_pct,status,website_visible")
    .eq("slug", slug)
    .maybeSingle();
  if (!exp || exp.page_template !== "event") return null;

  const { data: dateRows } = await db
    .from("exp_event_dates")
    .select("id,date_start,date_end,label,status,max_spots,sort_order")
    .eq("experience_id", exp.id)
    .order("sort_order")
    .order("date_start");
  const dates = ((dateRows ?? []) as EventDate[]).filter((d) => opts.includeAllDates || d.status !== "cancelled");

  // A race clinic is a format, not a place (migration 158): the edition holds
  // the venue and the experience only holds a default. Read the soonest live
  // edition's location so the page says Alaçatı in August and somewhere else
  // in October, without one experience row per venue.
  const { data: edRows } = await db
    .from("exp_editions")
    .select("id,slug,label,location,price,date_start,date_end,description")
    .eq("experience_id", exp.id)
    .eq("kind", "event")
    .eq("status", "published")
    .order("date_start");
  type EdRow = { id: string; slug: string | null; label: string | null; location: string | null; price: number | null; date_start: string | null; date_end: string | null; description: string | null };
  const editions = (edRows ?? []) as EdRow[];

  // One URL cannot sell two clinics. /experience/np7-race-clinic is the SERIES —
  // it sells whichever edition runs next — and /experience/np7-race-clinic/
  // <edition-slug> is one particular clinic, which is the link you put in a
  // WhatsApp group for that weekend. An unknown edition slug is a 404 rather
  // than a silent fallback to a different date, because quietly selling
  // somebody the wrong weekend is worse than telling them the link is dead.
  const today = new Date().toISOString().slice(0, 10);
  let pinned: EdRow | null = null;
  if (opts.editionSlug) {
    pinned = editions.find((e) => e.slug === opts.editionSlug) ?? null;
    if (!pinned) return null;
  } else {
    pinned = editions.find((e) => (e.date_end ?? e.date_start ?? "") >= today) ?? editions[0] ?? null;
  }

  // The package that actually sells this clinic. It carries the deposit and the
  // "final due N days before" — the same two fields every trip is priced from.
  // One active package is the normal shape for an event; if a clinic ever has
  // several, the cheapest deposit wins rather than an arbitrary row.
  let pkg: { id: string; deposit: number | null; final_days_before: number | null } | null = null;
  if (pinned) {
    const { data: pkgRows } = await db
      .from("exp_packages")
      .select("id,deposit,final_days_before,price,status,website_visible")
      .eq("edition_id", pinned.id)
      .eq("status", "active")
      .is("archived_at", null);
    const usable = ((pkgRows ?? []) as { id: string; deposit: number | null; final_days_before: number | null }[]);
    pkg = usable.sort((a, b) => Number(a.deposit ?? Infinity) - Number(b.deposit ?? Infinity))[0] ?? null;
  }

  /**
   * Where a date comes from, settled.
   *
   * FIXED event → the EDITION. It already carries date_start/date_end, and
   * `exp_event_dates` was a second place to type the same week — so the admin's
   * Event tab asked for a date the edition had, and a fully dated clinic could
   * advertise "Dates coming soon" because the duplicate row was missing.
   *
   * STAND-BY event → `exp_event_dates`. That is what the table is genuinely
   * for: several candidate weekends competing for one confirmation, which an
   * edition cannot express (an edition is a week that is happening).
   */
  const isStandby = exp.event_mode === "standby";
  let shown: EventDate[];
  if (isStandby) {
    shown = pinned?.date_start ? dates.filter((d) => d.date_start === pinned!.date_start) : dates;
    if (shown.length === 0) shown = dates;
  } else {
    shown = pinned?.date_start
      ? [{
          id: `edition:${pinned.id}`,
          date_start: pinned.date_start,
          date_end: pinned.date_end,
          label: pinned.label,
          status: "confirmed",
          max_spots: null,
          sort_order: 0,
        }]
      : [];
  }

  const soonest = pinned;

  return {
    id: exp.id,
    title: exp.title,
    slug: exp.slug,
    location: soonest?.location ?? exp.location,
    currency: exp.currency,
    // An event edition carries its own ticket price (migration 157) so a series
    // can charge differently per clinic; the experience price is the fallback.
    price: pinned?.price ?? exp.price,
    // The edition's own copy wins — the experience describes the FORMAT, and a
    // series that runs in two places cannot share one paragraph about a spot.
    // Same edition-overrides-experience rule as the packing list (migration 166).
    description: pinned?.description ?? exp.description,
    hero_image: exp.hero_image,
    mode: exp.event_mode === "standby" ? "standby" : "fixed",
    depositPct: exp.event_deposit_pct ?? 20,
    refundPct: exp.event_refund_pct ?? 15,
    plan: eventDepositPlan(Number(pinned?.price ?? exp.price ?? 0), pkg, pinned?.date_start ?? null),
    packageId: pkg?.id ?? null,
    editionId: pinned?.id ?? null,
    status: exp.status ?? null,
    websiteVisible: exp.website_visible !== false,
    dates: shown.length ? shown : dates,
    editionSlug: pinned?.slug ?? null,
    siblings: editions
      .filter((e) => e.id !== pinned?.id && e.slug && (e.date_end ?? e.date_start ?? "") >= today)
      .map((e) => ({ slug: e.slug as string, label: e.label, location: e.location, date_start: e.date_start, date_end: e.date_end })),
  };
}
