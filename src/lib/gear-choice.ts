import "server-only";
import { createAdminClient } from "@/lib/supabase";

/**
 * The booking-time gear choice — Model A (Nico, 2026-08-26).
 *
 * Base package prices KEEP the rental baked in (nothing repriced, nothing
 * retroactive). The public flow offers Rental (included, ±0) · Storage ·
 * Own gear; choosing away from rental writes ONE delta add-on row that
 * references the real component (sell_price is the customer truth —
 * unit_cost stays internal). Editions whose components aren't built yet
 * resolve to nothing and simply show no choice.
 */

export type GearComponent = { id: string; name: string; sell: number };
export type GearInfo = { rental: GearComponent | null; storage: GearComponent | null };
export type GearChoice = "rental" | "storage" | "none";

/**
 * The components governing this edition + package level.
 * Scope priority: edition-scoped → year-scoped → experience-wide; beginner
 * packages take a "…Beginner" rental when one exists (Alaçatı prices differ
 * by level — the name carries that fact today).
 */
export async function resolveGearInfo(
  experienceId: string,
  editionId: string | null,
  level: string | null,
): Promise<GearInfo> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  let year: string | null = null;
  if (editionId) {
    const { data: ed } = await db.from("exp_editions").select("date_start").eq("id", editionId).maybeSingle();
    year = ed?.date_start ? String(new Date(ed.date_start).getUTCFullYear()) : null;
  }
  const { data } = await db
    .from("exp_components")
    .select("id,name,sell_price,gear_option,edition_id,year,experience_id,is_global")
    .not("gear_option", "is", null)
    .is("archived_at", null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mine = ((data ?? []) as any[]).filter((c) => c.is_global || c.experience_id === experienceId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rank = (c: any): number =>
    c.edition_id
      ? (editionId && c.edition_id === editionId ? 0 : 99)
      : Array.isArray(c.year) && c.year.length
        ? (year && c.year.map(String).includes(year) ? 1 : 99)
        : 2;
  const eligible = mine.filter((c) => rank(c) < 99 && Number(c.sell_price) > 0);

  const pick = (kind: "rental" | "storage"): GearComponent | null => {
    let list = eligible.filter((c) => c.gear_option === kind);
    if (kind === "rental" && level) {
      const forLevel = list.filter((c) =>
        level === "beginner" ? /beginner/i.test(String(c.name)) : !/beginner/i.test(String(c.name)),
      );
      if (forLevel.length) list = forLevel;
    }
    list.sort((a, b) => rank(a) - rank(b));
    const c = list[0];
    return c ? { id: String(c.id), name: String(c.name), sell: Number(c.sell_price) } : null;
  };
  return { rental: pick("rental"), storage: pick("storage") };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Price delta vs the included rental. Rental (or no gear info) = 0. */
export function gearDelta(info: GearInfo, gear: GearChoice): number {
  if (gear === "rental" || !info.rental) return 0;
  if (gear === "storage") return info.storage ? round2(info.storage.sell - info.rental.sell) : 0;
  return round2(-info.rental.sell);
}

export function parseGearChoice(raw: unknown): GearChoice {
  return raw === "storage" || raw === "none" ? raw : "rental";
}
