/**
 * The level list the spotguide speaks, in ONE place.
 *
 * Nico's walkthrough (Nico, 6 Oct 2026) caught the guide using two vocabularies:
 * the add-a-spot form offered six levels (Beginner, Intermediate, Advanced,
 * Expert, Semi-Pro, Pro) while the index filter offered four. A rider who tagged
 * a spot "Expert" could then not find it under any filter pill. Both now read
 * this list.
 *
 * It is the member-progression ladder itself (member-level.ts LEVELS, which is
 * progression.ts RANKS), re-exported rather than retyped, so a rank added there
 * reaches the form, the filter and the stored spot data together. Pure: the
 * index filter runs it in the browser, the spots API runs it on the server.
 *
 * The add-a-spot form's own helpers (isSpotLevel, normalizeSpotLevels) live
 * here too, so the form, its API and the filter share one module rather than
 * two that each define the list.
 */
import { LEVELS, type Level } from "@/lib/member-level";

export const SPOT_LEVELS = LEVELS;
export type SpotLevel = Level;

export function isSpotLevel(v: unknown): v is SpotLevel {
  return typeof v === "string" && (SPOT_LEVELS as readonly string[]).includes(v);
}

/**
 * A submitted level list, cleaned: known levels only, each once, in ladder
 * order (Beginner first). Ladder order matters because the single `level`
 * column is "the first one", and the admin editor already writes it that way,
 * so a member's spot and an NP7 spot read the same.
 */
export function normalizeSpotLevels(raw: unknown): SpotLevel[] {
  if (!Array.isArray(raw)) return [];
  const picked = new Set(raw.filter(isSpotLevel));
  return SPOT_LEVELS.filter((l) => picked.has(l));
}

/** Position on the ladder, or -1 for anything that is not a level. */
export function spotLevelIndex(level: string | null | undefined): number {
  return level ? (SPOT_LEVELS as readonly string[]).indexOf(level) : -1;
}

/**
 * Does a destination's level range include `selected`?
 *
 * A missing or unknown end is open (min falls to the first rung, max to the
 * last), so a destination nobody has graded yet never disappears behind a
 * filter. An unknown `selected` filters nothing.
 */
export function destinationFitsLevel(
  d: { level_min: string | null; level_max: string | null },
  selected: string,
): boolean {
  const si = spotLevelIndex(selected);
  if (si === -1) return true;
  const lo = spotLevelIndex(d.level_min);
  const hi = spotLevelIndex(d.level_max);
  return si >= (lo < 0 ? 0 : lo) && si <= (hi < 0 ? SPOT_LEVELS.length - 1 : hi);
}

/** The filter pills worth showing: every level at least one destination fits, in ladder order. */
export function levelFilterOptions(
  dests: { level_min: string | null; level_max: string | null }[],
): SpotLevel[] {
  return SPOT_LEVELS.filter((l) => dests.some((d) => destinationFitsLevel(d, l)));
}
