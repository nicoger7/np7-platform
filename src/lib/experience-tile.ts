/**
 * Helpers for the auto-branded experience tiles.
 *
 * A tile is composited live from a raw hero photo + data: the big "place" name
 * (gold display text) and a faded country flag drape. Both are derived from the
 * experience's free-text `location` (e.g. "Alacati, Turkey", "Bonaire, Caribbean",
 * "Malmö, Schonen, Schweden") so no extra data entry is needed — with optional
 * per-experience overrides.
 */

// -- Place name ---------------------------------------------------------------

/**
 * The headline place for the tile — the first segment of the location
 * ("Lake Garda, Italy" -> "Lake Garda"). Falls back to the whole string.
 */
export function placeFromLocation(location: string | null | undefined): string {
  const first = (location ?? "").split(",")[0]?.trim();
  return first || (location ?? "").trim();
}

// -- Country flag -------------------------------------------------------------

export type FlagInfo = { code: string; name: string };

// Keyword -> ISO 3166-1 alpha-2 code (matched against the lowercased location).
// Covers every destination NP7 runs, in English and German spellings. Order
// matters: more specific keys first.
const COUNTRY_KEYWORDS: { match: string[]; code: string; name: string }[] = [
  { match: ["bonaire", "caribbean", "karibik"], code: "bq", name: "Bonaire" },
  { match: ["turkey", "türkiye", "turkiye", "türkei", "turkei", "alacati", "alaçatı"], code: "tr", name: "Turkey" },
  { match: ["italy", "italia", "italien", "garda"], code: "it", name: "Italy" },
  { match: ["spain", "españa", "espana", "spanien", "tenerife", "canary", "kanaren"], code: "es", name: "Spain" },
  { match: ["sweden", "schweden", "sverige", "malmö", "malmo", "schonen"], code: "se", name: "Sweden" },
  { match: ["madagascar", "madagaskar"], code: "mg", name: "Madagascar" },
  { match: ["netherlands", "holland", "niederlande"], code: "nl", name: "Netherlands" },
];

/**
 * Resolve the flag for a location by keyword. Returns null when nothing matches
 * (the tile then simply renders without a flag drape).
 */
export function flagFromLocation(location: string | null | undefined): FlagInfo | null {
  const hay = (location ?? "").toLowerCase();
  if (!hay) return null;
  for (const c of COUNTRY_KEYWORDS) {
    if (c.match.some((k) => hay.includes(k))) return { code: c.code, name: c.name };
  }
  return null;
}

/** Public path to a bundled flag SVG for an ISO code (see /public/flags). */
export function flagSrc(code: string): string {
  return `/flags/${code.toLowerCase()}.svg`;
}
