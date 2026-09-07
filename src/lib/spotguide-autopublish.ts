import "server-only";
import { haversineM } from "@/lib/geo";

/**
 * Publishing a member's spot without waiting for three riders.
 *
 * THE THING THIS DELIBERATELY DOES NOT DO IS LOOK THE SPOT UP ONLINE.
 *
 * That was the first design, and it was measured against the 39 spots already in
 * the guide before being thrown away. Every online signal ranked cities above
 * real windsurf spots. Alexanderplatz sits 100 m from mapped water and beats 23
 * of the 39. Sotavento, a PWA World Cup venue, has no water feature within 2 km.
 * Reverse geocoding Sotavento returns "España". There are around 590
 * sport=windsurfing objects on Earth, so a Lidl car park in Kiel, 138 m from
 * one, outranks 38 of the 39. And on the day it was tested one of three Overpass
 * hosts answered at all. Signals that are anti-correlated do not become reliable
 * by being combined, they become confidently wrong, and none of it belongs
 * inside a member's save request.
 *
 * What NP7 owns instead is better than anything a third party has: a paid,
 * attended trip at that destination. It is instant, worldwide, and it cannot be
 * faked without paying NP7 four figures and meeting the crew. Everything here is
 * local: no network call, nothing to rate limit, no provider to be down.
 *
 * Two rules shape the rest. Every gate FAILS CLOSED, so a database hiccup means
 * the spot waits for riders exactly as it does today, never that it publishes
 * unchecked. And a hold is not a rejection: it is the behaviour the guide has
 * always had.
 */

export type Coords = { lat: number; lng: number };

/** A gate that publishes; a hold that simply keeps today's behaviour. */
export type AutoDecision = {
  publish: boolean;
  /** Gate ids that held it back, empty when it publishes. */
  heldBy: string[];
  /** Everything the decision looked at, for the audit row and the admin page. */
  checks: Record<string, unknown>;
  /** Set only when it publishes: the evidence that carried it. */
  evidence?: Record<string, unknown>;
};

export const AUTOPUBLISH = {
  /**
   * How near an NP7-verified spot the pin must land.
   *
   * Every multi-spot cluster in the guide where a rider would plausibly add the
   * launch next door sits inside 3 km: El Medano's widest internal pair 1,693 m,
   * Sotavento to Risco del Paso 2,358 m, Flag Beach to Waikiki 2,875 m, Sorobon
   * to Lac Cai 2,943 m. The next real gap is La Caleta to Las Americas at
   * 5,595 m, and those are different bays. 3 km is "the same bay system".
   */
  ANCHOR_M: 3000,
  /**
   * Same-spot-under-another-name, by distance. The closest genuinely DISTINCT
   * pair in the guide is El Cabezo and La Jaquita at 269 m, both NP7-verified,
   * so 250 m leaves headroom and falsely flags none of the 39.
   */
  DUP_DIST_M: 250,
  /**
   * And by name, because distance alone is blind to it: the guide's one real
   * duplicate, Harbor Wall and Harbour Wall, sits 952 m apart.
   */
  DUP_NAME_M: 2000,
  DUP_NAME_SIM: 0.85,
  /**
   * A pin rounded to one decimal is a 5.5 km square, not a launch. Ten of the 39
   * real spots sit at exactly two decimals, so the bar cannot go higher.
   */
  MIN_DECIMALS: 2,
  /**
   * Transposed lat/lng. Range checks catch none of them here, since no spot has
   * |lng| > 90. Measured against the destination centre instead: the largest
   * legitimate offset is 43 km (Fuerteventura is one island-sized destination),
   * while the smallest displacement any swapped ground-truth pin produces is
   * 1,722 km. 150 km sits well clear of both.
   */
  SWAP_M: 150_000,
  /**
   * The whole guide has averaged 2.05 spots per destination over its life, and
   * its densest destination was built by NP7 over years. A member adding a third
   * new launch at one destination inside 90 days is outside anything that has
   * ever happened.
   */
  MAX_PER_DEST_90D: 2,
  MAX_LIFETIME: 6,
} as const;

/** Decimal places that actually carry information (trailing zeros do not). */
export function sigDecimals(n: number): number {
  const s = String(n);
  const dot = s.indexOf(".");
  if (dot < 0) return 0;
  return s.slice(dot + 1).replace(/0+$/, "").length;
}

/**
 * Names compared the way a person would: case, accents, brackets and the words
 * every spot shares carry no information about which spot it is.
 */
export function normaliseName(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/harbour/g, "harbor")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !["the", "beach", "bay", "spot", "playa", "strand", "de", "la", "el"].includes(w))
    .join(" ")
    .trim();
}

/** Dice coefficient over bigrams. 1 = identical, 0 = nothing shared. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const grams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ga = grams(a), gb = grams(b);
  let hits = 0, total = 0;
  for (const [g, n] of ga) { total += n; hits += Math.min(n, gb.get(g) ?? 0); }
  for (const n of gb.values()) total += n;
  return total === 0 ? 0 : (2 * hits) / total;
}

const ageDays = (iso: string) => (Date.now() - Date.parse(iso)) / 86_400_000;

/**
 * Was this member actually on an NP7 trip at this destination, and is it over?
 *
 * This is the load-bearing gate, and it is why member STANDING is not used
 * instead. earnedSpecialist() is reachable with roughly six free authenticated
 * POSTs and no account age, so two accounts can bootstrap each other. A finished
 * booking cannot be manufactured.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function completedTripAtDestination(db: any, contactId: string, destinationId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from("exp_bookings")
    .select("id, status, exp_editions(id, date_end, destination_id, exp_experiences(destination_id))")
    .eq("contact_id", contactId)
    .in("status", ["attended", "confirmed", "paid"]);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (data ?? []) as any[]) {
    const ed = b.exp_editions;
    if (!ed?.date_end || ed.date_end >= today) continue; // not finished yet
    // Migration 191: the edition's own destination overrides the experience's.
    const dest = ed.destination_id ?? ed.exp_experiences?.destination_id ?? null;
    if (dest === destinationId) {
      return { bookingId: b.id, editionId: ed.id, dateEnd: ed.date_end, status: b.status };
    }
  }
  return null;
}

/**
 * The decision. Every failure path returns publish:false, never throws upward:
 * the caller's job is unchanged whatever happens here.
 */
export async function canAutoPublish(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  contactId: string,
  destinationId: string,
  coords: Coords | null,
  name: string,
  isNewArea: boolean,
): Promise<AutoDecision> {
  const held: string[] = [];
  const checks: Record<string, unknown> = {};
  const hold = (id: string): AutoDecision => ({ publish: false, heldBy: [id], checks });

  // G0 . a spot with no pin cannot be checked geometrically at all, and a
  // brand-new area is a whole public page: never off a machine decision.
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return hold("G0_no_coords");
  if (isNewArea) return hold("G0_new_area");

  // R1-R3 . shapes that are not a place. Null island: no real spot is within
  // 12 degrees of it. Whole degrees: a 111 km cell, and the tell-tale of a
  // European decimal comma pasted in ("12,117" parsed as 12 and 117).
  if (Math.abs(coords.lat) > 90 || Math.abs(coords.lng) > 180) return hold("R1_range");
  if (Math.abs(coords.lat) < 0.5 && Math.abs(coords.lng) < 0.5) return hold("R2_null_island");
  if (Number.isInteger(coords.lat) && Number.isInteger(coords.lng)) return hold("R3_whole_degree");

  try {
    // H1 . precision
    checks.min_decimals = Math.min(sigDecimals(coords.lat), sigDecimals(coords.lng));
    if ((checks.min_decimals as number) < AUTOPUBLISH.MIN_DECIMALS) held.push("H1_precision");

    // G1 . the destination must already be a real, human-published place.
    // publishDestinationIfEarned() turns a draft area public off its first
    // verified spot, on the reasoning that a fake place cannot earn one. An
    // automatic verification would break that premise, so it must never feed it.
    const { data: dest, error: dErr } = await db
      .from("destinations").select("id, spotguide_status, lat, lng").eq("id", destinationId).maybeSingle();
    if (dErr) throw dErr;
    if (!dest) return hold("G1_dest_missing");
    if (dest.spotguide_status !== "published") held.push("G1_dest_not_published");

    // G2 . the member was actually there
    const trip = await completedTripAtDestination(db, contactId, destinationId);
    checks.trip = trip;
    if (!trip) held.push("G2_no_trip_at_destination");

    // G3 . the pin lands beside a spot NP7 ITSELF verified. Community-verified
    // spots may not anchor, or auto-publish chains off auto-publish. Measured:
    // requiring np7 costs no coverage at all against the current guide.
    const { data: siblings, error: sErr } = await db
      .from("spots").select("id, name, lat, lng, verification")
      .eq("destination_id", destinationId).eq("status", "published")
      .not("lat", "is", null).limit(500);
    if (sErr) throw sErr;
    const rows = (siblings ?? []) as { id: string; name: string; lat: number; lng: number; verification: string }[];

    let anchor: { id: string; name: string; d: number } | null = null;
    for (const s of rows.filter((r) => r.verification === "np7")) {
      const d = haversineM(coords, { lat: s.lat, lng: s.lng });
      if (!anchor || d < anchor.d) anchor = { id: s.id, name: s.name, d: Math.round(d) };
    }
    checks.anchor = anchor;
    if (!anchor || anchor.d > AUTOPUBLISH.ANCHOR_M) held.push("G3_no_anchor");

    // H2 . transposed pin, measured against the destination centre. Never treat
    // a null centre as zero, that puts the middle of the area on null island.
    if (dest.lat != null && dest.lng != null) {
      const straight = haversineM(coords, { lat: dest.lat, lng: dest.lng });
      const swapped = haversineM({ lat: coords.lng, lng: coords.lat }, { lat: dest.lat, lng: dest.lng });
      checks.dest_offset_m = Math.round(straight);
      if (straight > AUTOPUBLISH.SWAP_M && swapped < straight) held.push("H2_swapped");
    }

    // H3/H4 . the same launch under another name
    const na = normaliseName(name);
    for (const s of rows) {
      const d = haversineM(coords, { lat: s.lat, lng: s.lng });
      if (d <= AUTOPUBLISH.DUP_DIST_M) { held.push("H3_duplicate_distance"); break; }
    }
    for (const s of rows) {
      const nb = normaliseName(s.name);
      // The normaliser collapses short names to "", and two empty strings score
      // a perfect 1.00. No real spot name survives at under three characters,
      // so this guard costs nothing and stops "The Bay" matching "The Beach".
      if (na.length < 3 || nb.length < 3) continue;
      if (haversineM(coords, { lat: s.lat, lng: s.lng }) <= AUTOPUBLISH.DUP_NAME_M
          && similarity(na, nb) >= AUTOPUBLISH.DUP_NAME_SIM) { held.push("H4_duplicate_name"); break; }
    }

    // G4 . volume. Counted off the rows themselves, NOT off rateLimited(), which
    // fails OPEN by design and would therefore be no cap at all.
    const { data: mine, error: qErr } = await db
      .from("spots").select("id, destination_id, created_at")
      .eq("submitted_by", contactId).not("auto_review", "is", null);
    if (qErr) throw qErr;
    const own = (mine ?? []) as { destination_id: string; created_at: string }[];
    checks.quota_lifetime = own.length;
    checks.quota_dest_90d = own.filter((r) => r.destination_id === destinationId && ageDays(r.created_at) <= 90).length;
    if (own.length >= AUTOPUBLISH.MAX_LIFETIME) held.push("G4_lifetime_cap");
    if ((checks.quota_dest_90d as number) >= AUTOPUBLISH.MAX_PER_DEST_90D) held.push("G4_dest_cap");

    // G5 . one reversal, ever. Makes the abuse path a single shot.
    const { data: rev, error: rErr } = await db
      .from("spot_auto_publish").select("spot_id").eq("contact_id", contactId).not("reversed_at", "is", null).limit(1);
    if (rErr) throw rErr;
    if ((rev ?? []).length > 0) held.push("G5_prior_reversal");

    return held.length
      ? { publish: false, heldBy: held, checks }
      : { publish: true, heldBy: [], checks, evidence: { trip, anchor, destination_id: destinationId } };
  } catch {
    // FAILS CLOSED, and this sign must never be flipped. "We could not check, so
    // do not punish the member" would turn one database hiccup into an open
    // publishing endpoint. A hold costs the member nothing they had before.
    return { publish: false, heldBy: ["E_check_failed"], checks };
  }
}
