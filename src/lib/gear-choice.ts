import "server-only";
import { createAdminClient } from "@/lib/supabase";
import type { GearChoice, GearOptions } from "./gear-shape";

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
/** rentals[0] is the base tier (cheapest in the best scope) — `rental` keeps
    pointing at it for the existing maths; further entries are UPGRADES. */
export type GearInfo = { rental: GearComponent | null; rentals: GearComponent[]; storage: GearComponent | null };
/** Both live in gear-shape.ts, which the BROWSER imports too (this module is
    server-only). Re-exported so every existing `@/lib/gear-choice` import of
    them keeps working. */
export type { GearChoice, GearOptions };

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
  if (level === "beginner") return { rental: null, rentals: [], storage: null };
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

  const pickAll = (kind: "rental" | "storage"): GearComponent[] => {
    let list = eligible.filter((c) => c.gear_option === kind);
    if (kind === "rental" && level) {
      const forLevel = list.filter((c) =>
        level === "beginner" ? /beginner/i.test(String(c.name)) : !/beginner/i.test(String(c.name)),
      );
      if (forLevel.length) list = forLevel;
    }
    // Cheapest-first within the best scope: rentals[0] is the BASE tier (what
    // "included" means); anything after it is an upgrade — the slalom rig can
    // never accidentally become the included rental.
    list.sort((a, b) => rank(a) - rank(b) || Number(a.sell_price) - Number(b.sell_price));
    const best = list.length ? rank(list[0]) : 99;
    return list.filter((c) => rank(c) === best)
      .map((c) => ({ id: String(c.id), name: String(c.name), sell: Number(c.sell_price) }));
  };
  const rentals = pickAll("rental");
  return { rental: rentals[0] ?? null, rentals, storage: pickAll("storage")[0] ?? null };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function parseGearBaseline(raw: unknown): GearChoice {
  return raw === "storage" || raw === "none" ? raw : "rental";
}

/** What each option COSTS on top of nothing: rental/storage = their sell,
    none = 0. The delta shown/charged is cost(choice) − cost(baseline). */
function optionCost(info: GearInfo, gear: GearChoice, rentalId?: string | null): number | null {
  if (gear === "none") return 0;
  if (gear === "storage") return info.storage ? info.storage.sell : null;
  const chosen = rentalId ? info.rentals.find((r) => r.id === rentalId) : null;
  return (chosen ?? info.rental) ? (chosen ?? info.rental)!.sell : null;
}

/** Price delta vs the PACKAGE's declared baseline (migration 186). */
export function gearDelta(info: GearInfo, gear: GearChoice, baseline: GearChoice, rentalId?: string | null): number {
  const chosen = optionCost(info, gear, rentalId);
  const base = optionCost(info, baseline); // baseline always means the BASE rental tier
  if (chosen == null || base == null) return 0;
  return round2(chosen - base);
}

/** The renderable options for a package: null = choice not available for it.
    Each option carries its delta; the baseline option is the ±0 "included". */
export function gearOptions(info: GearInfo, baseline: GearChoice): GearOptions | null {
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
    // Upgrade tiers beyond the base rental (Tenerife: Slalom / Wave rigs) —
    // delta vs the BASE rental, shown as "+€…" inside the rental option.
    rentalTiers: info.rentals.length > 1
      ? info.rentals.map((r) => ({ id: r.id, name: r.name, delta: round2(r.sell - info.rentals[0].sell) }))
      : null,
  };
}

export function parseGearChoice(raw: unknown): GearChoice {
  return raw === "storage" || raw === "none" ? raw : "rental";
}

/**
 * One gear lookup per LEVEL for the whole request, shared by everyone on it.
 *
 * `resolveGearInfo` costs an edition read plus a full unfiltered scan of the
 * component catalogue, and a payer bringing five friends asks for the same two
 * or three levels over and over. The PROMISE is cached rather than the result,
 * so two callers that start together still only pay for one scan. Keyed on the
 * level, because that is the only input that varies here and there are three
 * or four of them, where there can be a dozen packages.
 */
export function makeGearResolver(
  experienceId: string,
  editionId: string | null,
): (level: string | null) => Promise<GearInfo> {
  const cache = new Map<string, Promise<GearInfo>>();
  return (level) => {
    const key = level ?? "";
    let hit = cache.get(key);
    if (!hit) {
      hit = resolveGearInfo(experienceId, editionId, level);
      cache.set(key, hit);
    }
    return hit;
  };
}

/** The one input shape both the writer and the comparator judge a choice by. */
export type GearPick = { gear: GearChoice; baseline: GearChoice; rentalId: string | null };

/**
 * Does this choice write nothing at all?
 *
 * Staying on the baseline costs nothing and records nothing. The one exception
 * is a rental UPGRADE tier, which is still "rental" but not free.
 *
 * Split out because it is asked BEFORE the component catalogue is resolved: a
 * solo registration on the baseline must not pay for a catalogue scan to learn
 * there is nothing to write.
 */
export function isBaselineGearPick(o: GearPick): boolean {
  return o.gear === o.baseline && !(o.gear === "rental" && !!o.rentalId);
}

/**
 * The component and the money a gear choice is worth, or null for nothing.
 *
 * Pure, and the single source for BOTH sides of the add-on: recordGearChoice
 * writes what this returns, and the same-submission check in
 * src/lib/resubmission.ts compares against what this returns. A second copy of
 * the "which component does this choice reference" rule would let the two
 * disagree, and a comparison that disagrees with the writer is a guest told
 * their change went through when it did not, or told it did not when it did.
 */
export function gearAddon(info: GearInfo, o: GearPick): { componentId: string; price: number } | null {
  if (isBaselineGearPick(o)) return null;
  const delta = gearDelta(info, o.gear, o.baseline, o.rentalId);
  const chosenRental = (o.rentalId && info.rentals.find((r) => r.id === o.rentalId)) || info.rental;
  const comp = o.gear === "storage" ? info.storage
    : o.gear === "rental" ? chosenRental
    : info.rental ?? info.storage; // "none": reference what was removed
  if (!comp || delta === 0) return null;
  return { componentId: comp.id, price: delta };
}

/**
 * Write the ONE delta row a choice away from the baseline earns, if it earns one.
 *
 * The payer and every companion they bring go through here, so the friend who
 * brings their own board gets the same row, on their own booking, as the person
 * paying does. Never throws and never reports: an edition whose gear components
 * are not built yet simply has nothing to record, and a failed add-on must
 * never cost anybody the booking that already exists.
 */
export async function recordGearChoice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  o: {
    bookingId: string;
    /** The package's OWN level (exp_packages.category), never the payer's. */
    level: string | null;
    gear: GearChoice;
    baseline: GearChoice;
    rentalId: string | null;
    resolve: (level: string | null) => Promise<GearInfo>;
  },
): Promise<void> {
  // Asked before the catalogue is resolved: nothing to write means nothing to
  // look up either.
  if (isBaselineGearPick(o)) return;
  try {
    const info = await o.resolve(o.level);
    const addon = gearAddon(info, o);
    const chosenRental = (o.rentalId && info.rentals.find((r) => r.id === o.rentalId)) || info.rental;
    if (addon) {
      // A guest reads these: they land on the payer's pro-forma and on the
      // member payment plan. Middle dot, never the long dash (Nico's rule).
      const LABELS: Record<string, string> = {
        rental: o.rentalId && chosenRental && chosenRental.id === o.rentalId && o.baseline === "rental"
          ? `Rental upgrade · ${chosenRental.name}`
          : "Gear rental · added to the package",
        storage: o.baseline === "rental" ? "Gear storage · included rental swapped out" : "Gear storage · added",
        none: o.baseline === "rental" ? "Own gear · included rental removed" : "Included storage removed",
      };
      const { error } = await db.from("exp_booking_addons").insert({
        booking_id: o.bookingId,
        component_id: addon.componentId,
        label: LABELS[o.gear],
        price: addon.price,
        status: "confirmed",
        source: "booking",
        payment_mode: "np7",
      });
      // Nothing downstream notices on its own. The booking keeps the whole
      // package price with no offsetting row, so the payer's pro-forma bills a
      // rental their friend declined and the only trace is this line.
      if (error) console.error("[gear] add-on row not written", { bookingId: o.bookingId, componentId: addon.componentId, price: addon.price, error });
    }
  } catch (err) {
    // Usually an edition whose gear components are not built, which is genuinely
    // nothing to record. It can equally be the catalogue read failing, and that
    // is a delta dropped on the floor, so say which one happened.
    console.error("[gear] choice not recorded", { bookingId: o.bookingId, gear: o.gear, err });
  }
}
