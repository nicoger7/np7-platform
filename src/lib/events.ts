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
  status: string | null;
  websiteVisible: boolean;
  dates: EventDate[];
  /** The edition being sold, when this page is pinned to one. */
  editionSlug?: string | null;
  /** Other upcoming clinics in the same series, for "other dates". */
  siblings?: { slug: string; label: string | null; location: string | null; date_start: string | null; date_end: string | null }[];
};

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
    .select("id,slug,label,location,price,date_start,date_end")
    .eq("experience_id", exp.id)
    .eq("kind", "event")
    .eq("status", "published")
    .order("date_start");
  type EdRow = { id: string; slug: string | null; label: string | null; location: string | null; price: number | null; date_start: string | null; date_end: string | null };
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

  // The dates the ticket box offers follow the edition being sold.
  const shown = pinned?.date_start ? dates.filter((d) => d.date_start === pinned!.date_start) : dates;
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
    description: exp.description,
    hero_image: exp.hero_image,
    mode: exp.event_mode === "standby" ? "standby" : "fixed",
    depositPct: exp.event_deposit_pct ?? 20,
    refundPct: exp.event_refund_pct ?? 15,
    status: exp.status ?? null,
    websiteVisible: exp.website_visible !== false,
    dates: shown.length ? shown : dates,
    editionSlug: pinned?.slug ?? null,
    siblings: editions
      .filter((e) => e.id !== pinned?.id && e.slug && (e.date_end ?? e.date_start ?? "") >= today)
      .map((e) => ({ slug: e.slug as string, label: e.label, location: e.location, date_start: e.date_start, date_end: e.date_end })),
  };
}
