/**
 * What a package should be called, derived from what it actually contains.
 *
 * Package names are load-bearing: the public picker splits them into a coaching
 * level and an accommodation label, the trip page groups by them, and the
 * confirmation prints them. Typed by hand, they drift — "Advanced - All
 * Inclusive - Standard Koyici" and "Advanced – All Inclusive – REF Koyici" are
 * the same idea written two ways, with a different dash, in the same week.
 *
 * So the name is composed from the fields, and stays editable. Generated is the
 * default, not the law: a name the team has deliberately written (a partner
 * rate, "Turkish Locals") must survive untouched.
 *
 * The separator is an en dash with spaces, matching what parsePackageName on
 * the public page splits on.
 */

const SEP = " – ";

export type PackageNameParts = {
  /** exp_packages.category — the coaching level. */
  level?: string | null;
  /** Hotel name, when one is linked. */
  hotelName?: string | null;
  /** The room type this package sells at that hotel. */
  roomType?: string | null;
  /** Extras worth naming, e.g. "Rental" — usually derived from components. */
  extras?: string[] | null;
};

const titled = (v: string) => v.trim().replace(/^./, (c) => c.toUpperCase());

/**
 * Compose the name. Returns "" when there is nothing to go on, so a caller can
 * tell "no suggestion" from "a suggestion that happens to be short".
 */
export function suggestPackageName(p: PackageNameParts): string {
  const parts: string[] = [];

  const level = (p.level ?? "").trim();
  if (level) parts.push(titled(level));

  const hotel = (p.hotelName ?? "").trim();
  const room = (p.roomType ?? "").trim();

  if (!hotel) {
    // No hotel is a REAL product — coaching only — and saying so is clearer
    // than leaving the accommodation segment off and letting the reader guess.
    parts.push("No Hotel");
  } else {
    // "All Inclusive – Standard Room" reads as the room; when the room type is
    // unset the hotel's own name is the most specific thing we have.
    parts.push("All Inclusive");
    parts.push(room ? `${titled(room)} Room`.replace(/\sRoom\sRoom$/i, " Room") : hotel);
  }

  for (const x of p.extras ?? []) {
    const e = x.trim();
    if (e) parts.push(titled(e));
  }

  return parts.filter(Boolean).join(SEP);
}

/**
 * Did this name come from the generator?
 *
 * Compared loosely — case, dash style and stray whitespace all differ across
 * the names already in the database, and a name that merely *looks* generated
 * should still be safe to regenerate. Anything genuinely hand-written (a
 * partner rate) won't match, so it is left alone.
 */
export function looksGenerated(name: string, suggestion: string): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[‐-―-]/g, "-").replace(/\s+/g, " ").trim();
  return norm(name) === norm(suggestion);
}
