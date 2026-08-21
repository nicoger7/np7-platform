import { createAdminClient } from "@/lib/supabase";
import { TIER_STEPS as LADDER } from "@/lib/tier-config";

/**
 * The loyalty ladder — Rider / Crew / Legend, computed live from trips
 * actually ridden. Deliberately UNSTORED: a tier is a fact about bookings, so
 * there is no column to drift out of date.
 *
 * Rules (Nico, final 2026-08-22):
 *  - A trip counts once its week has ENDED, with status attended/confirmed/
 *    paid. Lost never counts. An event/day-clinic weighs 0.25; a week 1.0.
 *  - CLIMBING is cumulative (weighted): Rider ≥1 · Crew ≥2 · Legend ≥4.
 *  - HOLDING needs recent riding: Crew ≥1 weighted trip in the last 12
 *    months, Legend ≥2 in the last 12 months. Falling short drops you ONE
 *    step (Legend→Crew→Rider) — never to zero, and the lifetime counter
 *    stays, so a returning rider climbs straight back.
 */
export type MemberTier = {
  key: "rider" | "crew" | "legend";
  label: string;
  /** Weighted lifetime trips (events = 0.25). */
  trips: number;
  /** Weighted trips still needed to CLIMB — null at the top. */
  toNext: number | null;
  nextLabel: string | null;
  /** ISO date the current tier lapses without another counted trip; null = never (Rider). */
  validUntil: string | null;
};

const HOLD: Record<"rider" | "crew" | "legend", number> = { rider: 0, crew: 1, legend: 2 };
const YEAR_MS = 365 * 86_400_000;

/** Null until the first trip is ridden — a badge you start with is not a badge. */
export async function getMemberTier(contactId: string): Promise<MemberTier | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("exp_bookings")
    .select("edition_id,status,exp_editions(date_end,kind)")
    .eq("contact_id", contactId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (Array.isArray(data) ? data : []) as any[];

  // one entry per edition: { end, weight }
  const byEdition = new Map<string, { end: string; weight: number }>();
  for (const b of rows) {
    if (!["attended", "confirmed", "paid"].includes(b.status)) continue;
    const end = b.exp_editions?.date_end as string | null;
    if (!b.edition_id || !end || end >= today) continue; // only finished weeks
    byEdition.set(b.edition_id, { end, weight: b.exp_editions?.kind === "event" ? 0.25 : 1 });
  }
  const trips = [...byEdition.values()].sort((a, b) => (a.end < b.end ? 1 : -1)); // newest first
  const total = Math.round(trips.reduce((s, t) => s + t.weight, 0) * 100) / 100;
  if (total < LADDER[0].min) return null;

  // climb by lifetime weighted count…
  const attained = [...LADDER].reverse().find((t) => total >= t.min)!;
  // …then hold by the last 12 months' weighted count
  const cutoff = new Date(Date.now() - YEAR_MS).toISOString().slice(0, 10);
  const recent12 = trips.filter((t) => t.end >= cutoff).reduce((s, t) => s + t.weight, 0);
  let key = attained.key;
  if (key === "legend" && recent12 < HOLD.legend) key = "crew";
  if (key === "crew" && recent12 < HOLD.crew) key = "rider";

  // "valid until": walk newest→oldest until the holding weight is covered; the
  // trip that covers it expires 12 months after its week ended.
  let validUntil: string | null = null;
  const need = HOLD[key];
  if (need > 0) {
    let cum = 0;
    for (const t of trips) {
      cum += t.weight;
      if (cum >= need) { validUntil = new Date(new Date(t.end + "T00:00:00Z").getTime() + YEAR_MS).toISOString().slice(0, 10); break; }
    }
  }

  const tier = LADDER.find((t) => t.key === key)!;
  const next = LADDER.find((t) => t.min > total) ?? null;
  return {
    key,
    label: tier.label,
    trips: total,
    toNext: next ? Math.round((next.min - total) * 100) / 100 : null,
    nextLabel: next?.label ?? null,
    validUntil,
  };
}
