import { createAdminClient } from "@/lib/supabase";
import { packageIncludes, withMemberArea } from "@/lib/package-includes";

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

/** One thing you can add to a clinic. Display only — the team adds it to the
 *  invoice; nothing here is sold at checkout. */
export type EventAddon = { name: string; description: string | null; price: number | null };

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
  /** What the ticket contains, from the run's own package. */
  included?: string[];
  /** What you can add to this run, shown but not sold on the page. */
  addons?: EventAddon[];
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
  opts: { includeAllDates?: boolean; editionSlug?: string; preview?: boolean } = {},
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
    .select("id,slug,label,location,price,date_start,date_end,description,video_analysis,photoshoot")
    .eq("experience_id", exp.id)
    .eq("kind", "event")
    /*
     * The team sees drafts, the public does not.
     *
     * Without this a clinic being prepared shows its team preview with NO date,
     * NO price and NO ticket box — the page cannot be judged before it is
     * published, which is exactly backwards. The till is unaffected: checkout
     * still sells published editions only, so previewing cannot take money.
     */
    .in("status", opts.preview ? ["published", "draft"] : ["published"])
    .order("date_start");
  type EdRow = { id: string; slug: string | null; label: string | null; location: string | null; price: number | null; date_start: string | null; date_end: string | null; description: string | null; video_analysis?: boolean | null; photoshoot?: boolean | null };
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
  /* What the ticket contains, as display lines. It is resolved from the SAME
     package row that supplies the deposit and the balance date, so the chips
     and the price can never end up describing different products. */
  let included: string[] = [];
  if (pinned) {
    const { data: pkgRows } = await db
      .from("exp_packages")
      // Never select unit_cost or sell_price on a component here: this list is
      // rendered to the public, and only name/description/category are display.
      .select("id,deposit,final_days_before,price,status,website_visible,includes,exp_package_components(show_on_website,quantity,exp_components(name,description,category))")
      .eq("edition_id", pinned.id)
      .eq("status", "active")
      .is("archived_at", null);
    const usable = ((pkgRows ?? []) as { id: string; deposit: number | null; final_days_before: number | null }[]);
    pkg = usable.sort((a, b) => Number(a.deposit ?? Infinity) - Number(b.deposit ?? Infinity))[0] ?? null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chosen = ((pkgRows ?? []) as any[]).find((p) => p.id === pkg?.id);
    if (chosen) {
      // The member area rides on a clinic seat exactly as it does on a trip
      // week — same helper, so the two lists cannot drift apart, and worded
      // for a clinic rather than a week.
      included = withMemberArea(packageIncludes(chosen), {
        video: pinned.video_analysis, photo: pinned.photoshoot, unit: "clinic",
      });
    }
  }

  /*
   * The add-on shelf: what you can add to this run, shown but not sold here.
   *
   * Scoped to the run (`edition_id`) so Hood River can rent different gear than
   * Hatteras, and tolerant of an unapplied migration — an events page must not
   * 500 because a column is missing. Projected field by field rather than
   * spread, so `sell_price` reaches the browser only as a resolved number and
   * `unit_cost` never leaves the server at all.
   */
  const addons: EventAddon[] = pinned
    ? await (async () => {
        try {
          const { data } = await db
            .from("exp_components")
            .select("id,name,description,sell_price,offer_at_booking,is_global,experience_id,edition_id,offer_sort,archived_at")
            .eq("offer_at_booking", true)
            .is("archived_at", null);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return ((data ?? []) as any[])
            .filter((c) => (c.is_global || c.experience_id === exp.id) && (!c.edition_id || c.edition_id === pinned!.id))
            .sort((a, b) => (a.offer_sort ?? 1e9) - (b.offer_sort ?? 1e9) || String(a.name).localeCompare(String(b.name)))
            .map((c) => ({
              name: String(c.name),
              description: (c.description as string | null) ?? null,
              price: c.sell_price == null ? null : Number(c.sell_price),
            }));
        } catch { return []; }
      })()
    : [];

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
    included,
    addons,
    siblings: editions
      .filter((e) => e.id !== pinned?.id && e.slug && (e.date_end ?? e.date_start ?? "") >= today)
      .map((e) => ({ slug: e.slug as string, label: e.label, location: e.location, date_start: e.date_start, date_end: e.date_end })),
  };
}

/**
 * Every upcoming run of a clinic series, each loaded exactly the way the page
 * would load it on its own.
 *
 * The series is ONE page with a selector in it, not a page per date, so the
 * whole set has to be on the page at once — the visitor switches between runs
 * without a navigation. Each run goes through `getEventForSlug` rather than a
 * second, lighter assembly: the ticket box reads a dozen fields (the package's
 * deposit, the balance due date, which date is on sale, whether the clinic has
 * already run) and a parallel loader would eventually disagree with the till
 * about one of them.
 *
 * Ordered by date. Empty for anything that is not an event experience.
 */
export async function getEventRuns(
  slug: string,
  opts: { preview?: boolean } = {},
): Promise<EventInfo[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: exp } = await db
    .from("exp_experiences").select("id,page_template").eq("slug", slug).maybeSingle();
  if (!exp || exp.page_template !== "event") return [];

  const today = new Date().toISOString().slice(0, 10);
  const { data: edRows } = await db
    .from("exp_editions")
    .select("slug,date_start,date_end")
    .eq("experience_id", exp.id)
    .eq("kind", "event")
    .in("status", opts.preview ? ["published", "draft"] : ["published"])
    .order("date_start");
  const slugs = ((edRows ?? []) as { slug: string | null; date_start: string | null; date_end: string | null }[])
    // A run that is over stops being offered — it would otherwise sit in the
    // selector quoting a balance due date that has already gone.
    .filter((e) => e.slug && (e.date_end ?? e.date_start ?? "") >= today)
    .map((e) => e.slug as string);

  const runs = await Promise.all(slugs.map((s) => getEventForSlug(slug, { ...opts, editionSlug: s })));
  return runs.filter((r): r is EventInfo => !!r);
}
