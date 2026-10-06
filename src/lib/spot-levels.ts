import { LEVELS, type Level } from "@/lib/member-level";

/**
 * The spotguide's ONE level vocabulary (Nico, 6 Oct 2026).
 *
 * The add-a-spot form offered six levels while the index filter offered four
 * (Beginner, Intermediate, Advanced, Pro), so a rider could tag a spot
 * "Expert" and then find no "Expert" to filter by. The six are what the
 * database already holds: spots.levels carries Expert and Semi-Pro today, and
 * the member profile, the "your visit" rater and the admin editor all write
 * them. Cutting to four would orphan that data; six loses nothing. So the six,
 * the member rank ladder, are the list on every spotguide surface.
 *
 * Pure (no React), so a server page can import it as well. Client components
 * can take it from level-picker.tsx, which re-exports it.
 */
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
