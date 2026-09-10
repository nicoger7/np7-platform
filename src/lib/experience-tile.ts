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

export type FlagInfo = {
  code: string;
  name: string;
  /**
   * A flag that is not one of the bundled SVGs carries its own image URL.
   * Absent means "the bundled file for this code" (see flagSrc).
   */
  src?: string | null;
};

/** A keyword rule. Bundled ones live below; custom ones come from exp_flags. */
export type FlagRule = FlagInfo & { match: string[] };

// Keyword -> ISO 3166-1 alpha-2 code (matched against the lowercased location).
// Covers every destination NP7 runs, in English and German spellings. Order
// matters: more specific keys first.
const COUNTRY_KEYWORDS: FlagRule[] = [
  { match: ["bonaire", "caribbean", "karibik"], code: "bq", name: "Bonaire" },
  { match: ["turkey", "türkiye", "turkiye", "türkei", "turkei", "alacati", "alaçatı"], code: "tr", name: "Turkey" },
  { match: ["italy", "italia", "italien", "garda"], code: "it", name: "Italy" },
  // Before Spain, and taking the islands with it. Tenerife is not mainland
  // Spain to anyone who windsurfs there, and Nico asked for the Canarian flag
  // by name. Sovereignty is not the question a tile is answering: the flag says
  // where you are going.
  { match: ["canary", "canarias", "kanaren", "kanarische", "tenerife", "teneriffa", "fuerteventura", "lanzarote", "gran canaria", "la palma", "la gomera", "el hierro", "el medano", "el médano"], code: "ic", name: "Canary Islands" },
  { match: ["spain", "españa", "espana", "spanien"], code: "es", name: "Spain" },
  { match: ["sweden", "schweden", "sverige", "malmö", "malmo", "schonen"], code: "se", name: "Sweden" },
  { match: ["madagascar", "madagaskar"], code: "mg", name: "Madagascar" },
  { match: ["netherlands", "holland", "niederlande"], code: "nl", name: "Netherlands" },
  { match: ["hatteras", "outer banks", "north carolina", "united states", "usa", "avon"], code: "us", name: "USA" },
];

/** The eight (now nine) flags that ship with the app. */
export const BUNDLED_FLAGS: FlagRule[] = COUNTRY_KEYWORDS;

/**
 * Resolve the flag for a location by keyword. Returns null when nothing matches
 * (the tile then simply renders without a flag drape).
 *
 * `custom` is the admin-managed set (see lib/flag-store). It is consulted FIRST,
 * so adding a flag is also how you correct this list without editing it.
 *
 * WHICH custom flag, when several match, is decided by where the keyword sits
 * in the location and not by how long it is. A location is written narrow to
 * broad — "Langebaan, South Africa", "El Medano, Tenerife" — so the earliest
 * match is the most specific one. Longest-keyword-wins looks equivalent and is
 * not: "south africa" is three letters longer than "langebaan" and would have
 * taken the national flag for a lagoon that has its own. Ties go to the longer
 * keyword, which only happens when two rules match at the same position.
 *
 * Passing nothing keeps the old behaviour exactly.
 */
export function flagFromLocation(location: string | null | undefined, custom?: FlagRule[] | null): FlagInfo | null {
  const hay = (location ?? "").toLowerCase();
  if (!hay) return null;
  let best: { rule: FlagRule; at: number; len: number } | null = null;
  for (const c of custom ?? []) {
    for (const k of c.match) {
      const key = k.trim().toLowerCase();
      if (!key) continue;
      const at = hay.indexOf(key);
      if (at < 0) continue;
      if (!best || at < best.at || (at === best.at && key.length > best.len)) best = { rule: c, at, len: key.length };
    }
  }
  if (best) return { code: best.rule.code, name: best.rule.name, src: best.rule.src ?? null };
  for (const c of COUNTRY_KEYWORDS) {
    if (c.match.some((k) => hay.includes(k))) return { code: c.code, name: c.name };
  }
  return null;
}

/** Where to load a flag's artwork from: its own image if it has one, otherwise
 *  the bundled SVG for its code (see /public/flags). Takes either the whole
 *  flag or a bare code, because half the call sites only ever had a code. */
export function flagSrc(flag: string | FlagInfo): string {
  if (typeof flag !== "string" && flag.src) return flag.src;
  const code = typeof flag === "string" ? flag : flag.code;
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
  // Extra coach cutouts. The whole crew renders as ONE right-anchored group,
  // and the extras' offsets are relative to their OWN figure size (CSS
  // translate %), not the tile width — edge-anchored percentages made the
  // spacing drift per aspect ratio (overlapping on narrow, scattered on
  // wide). coachNX = overlap toward Coach 1 (+ = closer/behind), coachNBottom
  // = lift in % of the figure's own height.
  coach2X?: number;      // overlap toward the lead, % of own width (default 22)
  coach2Bottom?: number; // lift, % of own height (default 0)
  coach2Scale?: number;  // default 62
  coach3X?: number;      // default 30
  coach3Bottom?: number; // default 0
  coach3Scale?: number;  // default 56
};

export const TILE_PLACEMENT_DEFAULTS: Required<TilePlacement> = {
  photoX: 50, photoY: 50, photoZoom: 100,
  coachRight: 0, coachBottom: 0, coachScale: 82,
  flagRight: -2, flagTop: -12, flagWidth: 42, flagRotate: 12, flagOpacity: 45, flagFade: 25,
  coach2X: 22, coach2Bottom: 0, coach2Scale: 62,
  coach3X: 30, coach3Bottom: 0, coach3Scale: 56,
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
