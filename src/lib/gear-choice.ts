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
  // Beginner packages never offer the choice — beginners don't fly in with
  // their own kit, rental is simply part of the week (Nico, 2026-08-26).
  if (level === "beginner") return { rental: null, storage: null };
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
    // Several candidates in the SAME scope shouldn't happen (see
    // docs/gear-choice.md), but if they do: the cheapest sell wins —
    // deterministic, and never accidentally 'includes' the slalom rig.
    list.sort((a, b) => rank(a) - rank(b) || Number(a.sell_price) - Number(b.sell_price));
    const c = list[0];
    return c ? { id: String(c.id), name: String(c.name), sell: Number(c.sell_price) } : null;
  };
  return { rental: pick("rental"), storage: pick("storage") };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function parseGearBaseline(raw: unknown): GearChoice {
  return raw === "storage" || raw === "none" ? raw : "rental";
}

/** What each option COSTS on top of nothing: rental/storage = their sell,
    none = 0. The delta shown/charged is cost(choice) − cost(baseline). */
function optionCost(info: GearInfo, gear: GearChoice): number | null {
  if (gear === "none") return 0;
  const c = gear === "rental" ? info.rental : info.storage;
  return c ? c.sell : null;
}

/** Price delta vs the PACKAGE's declared baseline (migration 186). */
export function gearDelta(info: GearInfo, gear: GearChoice, baseline: GearChoice): number {
  const chosen = optionCost(info, gear);
  const base = optionCost(info, baseline);
  if (chosen == null || base == null) return 0;
  return round2(chosen - base);
}

/** The renderable options for a package: null = choice not available for it.
    Each option carries its delta; the baseline option is the ±0 "included". */
export function gearOptions(info: GearInfo, baseline: GearChoice): {
  baseline: GearChoice;
  rentalName: string;
  deltas: { rental: number | null; storage: number | null; none: number };
} | null {
  if (!info.rental) return null;
  const base = optionCost(info, baseline);
  if (base == null) return null;
  return {
    baseline,
    rentalName: info.rental.name,
    deltas: {
      rental: round2(info.rental.sell - base),
      storage: info.storage ? round2(info.storage.sell - base) : null,
      none: round2(0 - base),
    },
  };
}

export function parseGearChoice(raw: unknown): GearChoice {
  return raw === "storage" || raw === "none" ? raw : "rental";
}
