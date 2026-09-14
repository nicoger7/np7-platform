/**
 * The SHAPE of a gear choice: what both the browser and the server need to
 * agree on, with none of the machinery that resolves it.
 *
 * gear-choice.ts is `server-only` because it reads the component catalogue, so
 * the picker and the reserve modal cannot reach into it for a type without
 * risking a value import that breaks a public page's build. These four things
 * are the whole contract between the two sides: what a choice can be, what the
 * quote hands back to render it, what each option is called, and how one
 * person's choice travels in a querystring.
 */

export type GearChoice = "rental" | "storage" | "none";

/** What `gearOptions()` returns and the quote sends: deltas only, never the
 *  raw component costs. null (from gearOptions) = this package offers no
 *  choice at all, e.g. a beginner package or an edition with no gear built. */
export type GearOptions = {
  baseline: GearChoice;
  rentalName: string;
  deltas: { rental: number | null; storage: number | null; none: number };
  rentalTiers: { id: string; name: string; delta: number }[] | null;
};

/** One vocabulary for the pills, the roster caption, and anywhere else a
 *  choice gets named. Two copies of the same three words drift, and the payer
 *  and the friend they are booking for have to read the same offer. */
export const GEAR_LABELS: Record<GearChoice, string> = {
  rental: "Rental gear",
  storage: "Own gear + storage",
  none: "Own gear",
};

/** One person's gear choice as the quote querystring carries it. */
export type GearSpec = { packageId: string; gear: GearChoice | null; rentalId: string | null };

/** `packageId` · `packageId:gear` · `packageId:gear:rentalId`. Package and
 *  component ids are uuids and carry no colon, which is what makes the
 *  separator safe. */
export function encodeGearSpec(spec: { packageId: string; gear?: GearChoice | null; rentalId?: string | null }): string {
  if (!spec.gear) return spec.packageId;
  return spec.rentalId ? `${spec.packageId}:${spec.gear}:${spec.rentalId}` : `${spec.packageId}:${spec.gear}`;
}

export function parseGearSpec(raw: string): GearSpec {
  const [packageId = "", gear = "", rentalId = ""] = raw.split(":");
  return {
    packageId,
    // A bare id (a bookmarked quote URL, a client that has not reloaded since
    // the format changed) means "whatever this package's own baseline is",
    // NOT rental. parseGearChoice maps anything unknown to rental, which here
    // would quote kit onto a package whose price never contained any.
    gear: gear === "rental" || gear === "storage" || gear === "none" ? gear : null,
    rentalId: rentalId || null,
  };
}

/**
 * What one person's gear choice adds to their own package price.
 *
 * The rental option carries TWO numbers and reading only the first is the bug
 * this exists to end: `deltas.rental` is the BASE tier (what the included kit
 * is worth against this package's baseline, 0 on a baseline-rental package),
 * while the upgrade a guest actually picked lives in `rentalTiers[].delta`.
 * The server's `gearDelta()` has always priced the chosen tier, so a roster
 * reading deltas alone showed 5,600 under a plan panel showing 5,741 and a
 * booking written a +141 add-on row.
 *
 * One helper for the roster, the picker's rows and the picker's summary,
 * because three copies of this sum are exactly how they drifted apart.
 */
export function gearAdjustment(
  options: GearOptions | null | undefined,
  gear: GearChoice | null | undefined,
  rentalId: string | null | undefined,
): number {
  if (!options) return 0;
  // An untouched choice IS the package's baseline, and the baseline is ±0 by
  // construction. A tier still rides on it: the server reads `rentalId` against
  // the EFFECTIVE choice, never against an explicitly typed one.
  const effective = gear ?? options.baseline;
  // null = this package does not offer that option at all, which is worth
  // nothing rather than NaN.
  const base = options.deltas[effective] ?? 0;
  const tier = effective === "rental" && rentalId
    ? options.rentalTiers?.find((t) => t.id === rentalId)?.delta ?? 0
    : 0;
  // Both halves are already rounded. Adding two of them is where the cent that
  // makes a roster disagree with an invoice creeps back in.
  return Math.round((base + tier + Number.EPSILON) * 100) / 100;
}
