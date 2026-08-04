import { createAdminClient } from "@/lib/supabase";

/**
 * How many can we still sell?
 *
 * Two pools have to have room, and a package sits under both: the WEEK (its
 * max_spots — coaches, boat, how many people the trip is) and the HOTEL (the
 * beds we hold for the room type that package sells). A package with no hotel
 * is limited by the week alone. On top sits an optional ALLOCATION — the
 * package's own max_spots — so one package cannot eat the whole trip.
 *
 * The arithmetic lives in SQL (migration 143, view exp_package_availability),
 * not here. That is deliberate: there were four copies of "this booking holds a
 * spot" scattered across the codebase and they disagreed, and the one stored
 * counter — exp_editions.spots_taken — had no writer at all and read 3 where
 * the truth was 21. Nothing is counted and stored now; every number is derived
 * on read, so cancelling frees both the spot and the bed with no write, and the
 * hotel taking a room back changes every figure on the next render.
 *
 * NULL means "nothing here limits you", never zero. A week with no cap, a
 * package with no hotel, a hotel whose rooms nobody has entered — all NULL, and
 * the public pages must keep rendering those as bookable. Only a pool that
 * genuinely ran out returns 0.
 *
 * Reads via the service-role client: the views are revoked from anon, and the
 * public pages have always fetched spot counts this way.
 */

/** Which pool (or pools) is holding this package back. */
export type BindingPool = "edition" | "allocation" | "rooms";

export type PackageAvailability = {
  packageId: string;
  editionId: string;
  /** null = nothing limits this package. Never null and 0 at once. */
  spotsLeft: number | null;
  /** Every pool sitting at the minimum — two limits at once is a real state. */
  binding: BindingPool[];
  editionCap: number | null;
  editionUsed: number;
  editionFree: number | null;
  /** How far past its cap the week already is. 0 when within. */
  editionOver: number;
  allocationCap: number | null;
  allocationUsed: number;
  allocationFree: number | null;
  /** Live rooms in this package's pool. null = no pool resolved at all. */
  rooms: number | null;
  /** Rooms we have ever held here, released ones included. */
  roomsEver: number | null;
  bedsTotal: number | null;
  bedsUsed: number | null;
  bedsFree: number | null;
  /** People in rooms beyond what those rooms sleep. */
  bedsOver: number | null;
  /** A room in the pool has no bed count, so the pool cannot be trusted. */
  bedsUnknown: boolean;
  roomFree: number | null;
  hotelId: string | null;
  roomType: string | null;
  bedsPerBooking: number;
  /** Has a hotel but nobody has said which room type — rooms don't limit it. */
  poolUndeclared: boolean;
};

export type EditionAvailability = {
  editionId: string;
  cap: number | null;
  used: number;
  free: number | null;
  over: number;
  /** Per package, keyed by package id. */
  packages: Map<string, PackageAvailability>;
  /** The week is bookable while ANY package still has room. */
  bestSpotsLeft: number | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function toPackage(r: Row): PackageAvailability {
  return {
    packageId: r.package_id,
    editionId: r.edition_id,
    spotsLeft: r.spots_left ?? null,
    binding: (r.binding ?? []) as BindingPool[],
    editionCap: r.edition_cap ?? null,
    editionUsed: r.edition_used ?? 0,
    editionFree: r.edition_free ?? null,
    editionOver: r.edition_over ?? 0,
    allocationCap: r.allocation_cap ?? null,
    allocationUsed: r.allocation_used ?? 0,
    allocationFree: r.allocation_free ?? null,
    rooms: r.rooms ?? null,
    roomsEver: r.rooms_ever ?? null,
    bedsTotal: r.beds_total ?? null,
    bedsUsed: r.beds_used ?? null,
    bedsFree: r.beds_free ?? null,
    bedsOver: r.beds_over ?? null,
    bedsUnknown: !!r.beds_unknown,
    roomFree: r.room_free ?? null,
    hotelId: r.hotel_id ?? null,
    roomType: r.room_type ?? null,
    bedsPerBooking: r.beds_per_booking ?? 1,
    poolUndeclared: !!r.pool_undeclared,
  };
}

/**
 * Availability for a set of editions, packages included.
 *
 * One round trip for the lot — the /experience index renders a dozen weeks and
 * must not query per week.
 */
export async function availabilityFor(
  editionIds: (string | null | undefined)[]
): Promise<Map<string, EditionAvailability>> {
  const ids = [...new Set(editionIds.filter(Boolean))] as string[];
  const out = new Map<string, EditionAvailability>();
  if (!ids.length) return out;

  const db = createAdminClient() as any;
  const [{ data: edRows }, { data: pkgRows }] = await Promise.all([
    db.from("exp_edition_pool").select("edition_id, cap, used, free, over_cap").in("edition_id", ids),
    db.from("exp_package_availability").select("*").in("edition_id", ids),
  ]);

  for (const e of (edRows ?? []) as Row[]) {
    out.set(e.edition_id, {
      editionId: e.edition_id,
      cap: e.cap ?? null,
      used: e.used ?? 0,
      free: e.free ?? null,
      over: e.over_cap ?? 0,
      packages: new Map(),
      bestSpotsLeft: e.free ?? null,
    });
  }

  for (const r of (pkgRows ?? []) as Row[]) {
    out.get(r.edition_id)?.packages.set(r.package_id, toPackage(r));
  }

  // The week is sellable while ANY of its packages is — a full hotel must not
  // hide an "Experience Only" package that has no beds to lose. Weeks with no
  // packages keep the week's own free count.
  for (const ed of out.values()) {
    if (!ed.packages.size) continue;
    let best: number | null = 0;
    for (const p of ed.packages.values()) {
      if (p.spotsLeft === null) { best = null; break; }
      if (best !== null && p.spotsLeft > best) best = p.spotsLeft;
    }
    ed.bestSpotsLeft = best;
  }

  return out;
}

/**
 * Spots left for one package. A null package id falls back to the week's own
 * pool — admin-created bookings often carry no package.
 */
export async function spotsLeftForPackage(
  editionId: string,
  packageId: string | null
): Promise<{ left: number | null; binding: BindingPool[]; detail: PackageAvailability | null }> {
  const ed = (await availabilityFor([editionId])).get(editionId);
  if (!ed) return { left: null, binding: [], detail: null };
  const p = packageId ? ed.packages.get(packageId) : undefined;
  if (!p) return { left: ed.free, binding: ed.free === null ? [] : ["edition"], detail: null };
  return { left: p.spotsLeft, binding: p.binding, detail: p };
}

/* ─────────────────────────────────────────────────────────────────────────
   Week-level shims. Some pages ask "how full is this week?" before a package
   has been chosen, so these stay — but they now read the same SQL as
   everything else instead of counting bookings themselves.
   ───────────────────────────────────────────────────────────────────────── */

/** Secured (deposit paid onward) head-count per edition. */
export async function paidSpotsByEdition(
  editionIds: (string | null | undefined)[]
): Promise<Record<string, number>> {
  const ids = [...new Set(editionIds.filter(Boolean))] as string[];
  if (!ids.length) return {};
  const db = createAdminClient() as any;
  const { data } = await db.from("exp_edition_pool").select("edition_id, used").in("edition_id", ids);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as Row[]) out[r.edition_id] = r.used ?? 0;
  return out;
}

/** Spots left from a cap and the secured count (null when there's no cap). */
export function spotsLeftFrom(maxSpots: number | null | undefined, securedCount: number): number | null {
  return maxSpots != null ? Math.max(0, maxSpots - securedCount) : null;
}
