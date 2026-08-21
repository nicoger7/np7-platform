import { createAdminClient } from "@/lib/supabase";
import { TIER_STEPS as LADDER, TIER_KEEP } from "@/lib/tier-config";

/**
 * The loyalty ladder — Rider / Crew / Legend, computed live from trips
 * actually ridden. Deliberately UNSTORED: a tier is a fact about bookings.
 *
 * Rules (Nico, final v2, 2026-08-22):
 *  - A trip counts once its week has ENDED, status attended/confirmed/paid;
 *    lost never counts. A week weighs 1.0, an event/clinic 0.25.
 *  - RIDER you are always — every member, from day one.
 *  - CREW after your 1st counted trip · KEEP with 2 weighted trips per
 *    rolling 24 months (the 1st trip protects it for its first 24 months).
 *  - LEGEND is a PACE, not a total (Nico, v3): 2 weighted trips within the
 *    last 12 months — earned and held by the same rolling rule.
 */
export type MemberTier = {
  key: "rider" | "crew" | "legend";
  label: string;
  /** Weighted lifetime trips (events = 0.25). */
  trips: number;
  /** Weighted trips still needed to CLIMB — null when the pace, not the count, is the story. */
  toNext: number | null;
  nextLabel: string | null;
  /** ISO date the current tier lapses without more riding; null = never (Rider). */
  validUntil: string | null;
};

const WINDOW_MS = 2 * 365 * 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const plus24mo = (d: string) => iso(new Date(d + "T00:00:00Z").getTime() + WINDOW_MS);

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

  const byEdition = new Map<string, { end: string; weight: number }>();
  for (const b of rows) {
    if (!["attended", "confirmed", "paid"].includes(b.status)) continue;
    const end = b.exp_editions?.date_end as string | null;
    if (!b.edition_id || !end || end >= today) continue;
    byEdition.set(b.edition_id, { end, weight: b.exp_editions?.kind === "event" ? 0.25 : 1 });
  }
  const asc = [...byEdition.values()].sort((a, b) => (a.end < b.end ? -1 : 1));
  const total = Math.round(asc.reduce((s, t) => s + t.weight, 0) * 100) / 100;
  const cutoff = iso(Date.now() - WINDOW_MS);
  const recent = asc.filter((t) => t.end >= cutoff).reduce((s, t) => s + t.weight, 0);

  /** The date cumulative weight first reached `min` — the climb-completing trip. */
  const attainedOn = (min: number): string | null => {
    let cum = 0;
    for (const t of asc) { cum += t.weight; if (cum >= min) return t.end; }
    return null;
  };

  const cutoff12 = iso(Date.now() - WINDOW_MS / 2);
  const recent12 = asc.filter((t) => t.end >= cutoff12).reduce((s, t) => s + t.weight, 0);

  // Legend = the rolling year: 2 weighted trips in the last 12 months.
  const legendActive = recent12 >= 2;
  // Crew = ever ridden, kept by 2 per 24 months (first trip protects 24 months).
  const crewOn = attainedOn(1);
  const crewActive = !!crewOn && (crewOn >= cutoff || recent >= TIER_KEEP.crew);

  const key: MemberTier["key"] = legendActive ? "legend" : crewActive ? "crew" : "rider";

  // Valid until — Legend: the day the rolling year drops below 2 (12 months
  // after the trip that still covers the pace); Crew: 24-month logic.
  let validUntil: string | null = null;
  if (key === "legend") {
    let cum = 0;
    for (const t of [...asc].reverse()) {
      cum += t.weight;
      if (cum >= 2) { validUntil = iso(new Date(t.end + "T00:00:00Z").getTime() + WINDOW_MS / 2); break; }
    }
  } else if (key === "crew") {
    const candidates: string[] = [];
    if (crewOn) candidates.push(plus24mo(crewOn));
    let cum = 0;
    for (const t of [...asc].reverse()) {
      cum += t.weight;
      if (cum >= TIER_KEEP.crew) { candidates.push(plus24mo(t.end)); break; }
    }
    validUntil = candidates.sort().pop() ?? null;
  }

  // "to next": Rider → your 1st trip; Crew → what's missing on the rolling
  // year toward Legend's 2-in-12-months pace.
  const next = key === "rider" ? LADDER[1] : key === "crew" ? LADDER[2] : null;
  const toNextVal = key === "rider" ? Math.max(0, 1 - total) : key === "crew" ? Math.max(0, 2 - recent12) : null;
  const tier = LADDER.find((l) => l.key === key)!;
  return {
    key,
    label: tier.label,
    trips: total,
    toNext: toNextVal != null && toNextVal > 0 ? Math.round(toNextVal * 100) / 100 : null,
    nextLabel: next?.label ?? null,
    validUntil,
  };
}
