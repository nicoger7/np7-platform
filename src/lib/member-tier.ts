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
 *    rolling 24 months.
 *  - LEGEND after your 2nd counted trip · KEEP with 4 per rolling 24 months.
 *  - Fresh status is protected: the trip that COMPLETED the climb holds the
 *    tier for 24 months on its own — nobody is demoted the week they arrive.
 *    Once that trip ages out, the keep-rate decides.
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

  /** A tier is active when attained AND (fresh-attainment protection OR keep-rate met). */
  const active = (key: "crew" | "legend"): boolean => {
    const min = LADDER.find((l) => l.key === key)!.min;
    const on = attainedOn(min);
    if (!on) return false;
    return on >= cutoff || recent >= TIER_KEEP[key];
  };

  const key: MemberTier["key"] = active("legend") ? "legend" : active("crew") ? "crew" : "rider";

  // Valid until: the later of (attainment trip + 24mo) and the keep-window edge.
  let validUntil: string | null = null;
  if (key !== "rider") {
    const min = LADDER.find((l) => l.key === key)!.min;
    const candidates: string[] = [];
    const on = attainedOn(min);
    if (on) candidates.push(plus24mo(on));
    // rolling keep: walk newest→oldest until the keep weight is covered
    const need = TIER_KEEP[key];
    let cum = 0;
    for (const t of [...asc].reverse()) {
      cum += t.weight;
      if (cum >= need) { candidates.push(plus24mo(t.end)); break; }
    }
    validUntil = candidates.sort().pop() ?? null;
  }

  const next = key === "rider" && total < 1 ? LADDER[1] : key !== "legend" && total < 2 ? LADDER[2] : null;
  const tier = LADDER.find((l) => l.key === key)!;
  return {
    key,
    label: tier.label,
    trips: total,
    toNext: next ? Math.round((next.min - total) * 100) / 100 : null,
    nextLabel: next?.label ?? null,
    validUntil,
  };
}
