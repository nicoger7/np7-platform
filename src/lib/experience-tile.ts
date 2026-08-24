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

// -- Tile placement (auto-brand card editor) ----------------------------------

/**
 * Optional per-experience overrides for how <BrandedTile> composites the photo,
 * coach and flag. Every field is optional; missing ones fall back to
 * TILE_PLACEMENT_DEFAULTS, which reproduce the original hardcoded layout exactly
 * — so an experience with no saved placement renders identically to before.
 * Stored as JSON in exp_content.card_placement.
 */
export type TilePlacement = {
  photoX?: number;      // object-position X, 0–100 (default 50)
  photoY?: number;      // object-position Y, 0–100 (default 50)
  photoZoom?: number;   // zoom %, 100 = cover; higher creates room to pan (default 100)
  coachRight?: number;  // % offset from the right edge (default 0; negative pushes off-screen)
  coachBottom?: number; // % offset from the bottom (default 0)
  coachScale?: number;  // coach height as % of the tile (default 82)
  flagRight?: number;   // % offset from the right edge (default -2)
  flagTop?: number;     // % offset from the top (default -12)
  flagWidth?: number;   // flag width as % of the tile (default 42)
  flagRotate?: number;  // degrees (default 12)
  flagOpacity?: number; // 0–100 (default 45)
  flagFade?: number;    // fade-off strength 0–100 (default 25 ≈ the original mask)
  // Extra coach cutouts — a week can front two or three coaches. The LEAD
  // coach stays right-locked (the alignment promise); extras anchor from the
  // LEFT edge so they can never collide with that lock.
  coach2X?: number;      // % from the left edge (default 1)
  coach2Bottom?: number; // default 0
  coach2Scale?: number;  // default 62
  coach3X?: number;      // default 24
  coach3Bottom?: number; // default 0
  coach3Scale?: number;  // default 56
};

export const TILE_PLACEMENT_DEFAULTS: Required<TilePlacement> = {
  photoX: 50, photoY: 50, photoZoom: 100,
  coachRight: 0, coachBottom: 0, coachScale: 82,
  flagRight: -2, flagTop: -12, flagWidth: 42, flagRotate: 12, flagOpacity: 45, flagFade: 25,
  coach2X: 1, coach2Bottom: 0, coach2Scale: 62,
  coach3X: 24, coach3Bottom: 0, coach3Scale: 56,
};

/** Merge a (possibly partial / null) placement over the defaults.
 *  The lead coach's horizontal position was once locked so every tile lines
 *  up — unlocked 2026-08-25: with two- and three-coach crews the lead needs
 *  to move sideways to compose against the extras, and the admin asked for
 *  the control three times. Alignment is now a default, not a law. */
export function resolveTilePlacement(p?: TilePlacement | null): Required<TilePlacement> {
  return { ...TILE_PLACEMENT_DEFAULTS, ...(p ?? {}) };
}

/** The flag's fade mask for a given fade strength (higher = flag fades out more). */
export function flagFadeMask(fade: number): string {
  const start = Math.max(0, Math.min(40, fade * 0.4)); // 0–40%
  return `linear-gradient(104deg, transparent ${start}%, rgba(0,0,0,0.7) ${start + 30}%, #000 ${start + 60}%)`;
}
