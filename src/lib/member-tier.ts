import { createAdminClient } from "@/lib/supabase";

/**
 * The loyalty ladder — Rider / Crew / Legend, computed from trips actually
 * ridden. Deliberately UNSTORED: a tier is a fact about bookings (attended, or
 * confirmed/paid on a week that has ended), so there is no column to drift out
 * of date and nothing to migrate. Perks come later; the ladder ships first so
 * the badge can start meaning something.
 *
 * Thresholds (Nico, 2026-08-21): 1 trip = Rider, 2+ = Crew, 4+ = Legend.
 * Pre-platform trips aren't in the system — they can be honored per person by
 * marking an old booking attended.
 */
export type MemberTier = {
  key: "rider" | "crew" | "legend";
  label: string;
  /** Distinct weeks ridden. */
  trips: number;
  /** Trips still needed for the next tier — null at the top. */
  toNext: number | null;
  nextLabel: string | null;
};

const LADDER = [
  { key: "rider" as const, label: "Rider", min: 1 },
  { key: "crew" as const, label: "Crew", min: 2 },
  { key: "legend" as const, label: "Legend", min: 4 },
];

/** Null until the first trip is ridden — a badge you start with is not a badge. */
export async function getMemberTier(contactId: string): Promise<MemberTier | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("exp_bookings")
    .select("edition_id,status,exp_editions(date_end)")
    .eq("contact_id", contactId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (Array.isArray(data) ? data : []) as any[];
  const ridden = new Set(
    rows
      .filter((b) => b.status === "attended" ||
        (["confirmed", "paid"].includes(b.status) && b.exp_editions?.date_end && b.exp_editions.date_end < today))
      .map((b) => b.edition_id)
      .filter(Boolean)
  );
  const trips = ridden.size;
  if (!trips) return null;
  const tier = [...LADDER].reverse().find((t) => trips >= t.min)!;
  const next = LADDER.find((t) => t.min > trips) ?? null;
  return { key: tier.key, label: tier.label, trips, toNext: next ? next.min - trips : null, nextLabel: next?.label ?? null };
}
