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
export async function getEventForSlug(slug: string, opts: { includeAllDates?: boolean } = {}): Promise<EventInfo | null> {
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

  return {
    id: exp.id,
    title: exp.title,
    slug: exp.slug,
    location: exp.location,
    currency: exp.currency,
    price: exp.price,
    description: exp.description,
    hero_image: exp.hero_image,
    mode: exp.event_mode === "standby" ? "standby" : "fixed",
    depositPct: exp.event_deposit_pct ?? 20,
    refundPct: exp.event_refund_pct ?? 15,
    status: exp.status ?? null,
    websiteVisible: exp.website_visible !== false,
    dates,
  };
}
