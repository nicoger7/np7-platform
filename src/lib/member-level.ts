/* Member level model — pure (no server imports), shared by the portal data
   layer, the member + admin routes, and the client UI. One overall level per
   member with provenance: self → coach-suggested → coach-verified. A "suggested"
   status is private; the displayed (public) level falls back to the member's
   self-declared value until they accept. */

export const LEVELS = ["Beginner", "Intermediate", "Advanced", "Pro"] as const;
export type Level = (typeof LEVELS)[number];
export type LevelStatus = "self" | "suggested" | "verified";

export function isLevel(v: unknown): v is Level {
  return typeof v === "string" && (LEVELS as readonly string[]).includes(v);
}
/** Canonical level or "" (to clear). */
export function normalizeLevel(raw: unknown): Level | "" {
  return isLevel(raw) ? raw : "";
}
export function normalizeStatus(raw: unknown): LevelStatus {
  return raw === "suggested" || raw === "verified" ? raw : "self";
}

export type Milestone = { id: string; key: string; label: string; tier: string; sort_order: number };

/**
 * The highest tier whose milestones — and every lower tier's — are fully ticked.
 * Conservative + transparent (stops at the first incomplete tier); the coach can
 * always override up or down. Returns null when nothing is complete.
 */
export function deriveSuggestedLevel(catalog: Milestone[], achievedIds: Set<string>): Level | null {
  let result: Level | null = null;
  for (const tier of LEVELS) {
    const inTier = catalog.filter((m) => m.tier === tier);
    if (inTier.length === 0) continue;
    if (inTier.every((m) => achievedIds.has(m.id))) result = tier;
    else break;
  }
  return result;
}

/**
 * What level + badge to show publicly. Verified → the coach value with a badge;
 * otherwise the member's self-declared value. Falls back to the legacy `level`
 * column when the migration-036 fields aren't present (tolerant), so the display
 * never regresses before 036 is applied.
 */
export function displayLevel(p: { self_level?: string | null; level?: string | null; level_status?: string | null }): { level: string | null; verified: boolean } {
  if (p.level_status === "verified" && p.level) return { level: p.level, verified: true };
  if (p.self_level) return { level: p.self_level, verified: false };
  return { level: p.level ?? null, verified: false };
}

/** Is there a coach suggestion the member hasn't acted on? (Private to them.) */
export function hasPendingSuggestion(p: { level?: string | null; level_status?: string | null }): boolean {
  return p.level_status === "suggested" && !!p.level;
}

/** Per-tier completion, for a "your progress" view. */
export function tierProgress(catalog: Milestone[], achievedIds: Set<string>): { tier: Level; done: number; total: number }[] {
  return LEVELS.map((tier) => {
    const inTier = catalog.filter((m) => m.tier === tier);
    return { tier, done: inTier.filter((m) => achievedIds.has(m.id)).length, total: inTier.length };
  });
}

export type TierStat = { tier: Level; done: number; total: number };
/** Progression summary from a list of (tier, achieved) milestones — shared by the
    "Your level" card and the home dashboard. `nextTier` is the first incomplete
    tier; `toNext` the skills remaining in it. */
export function levelProgress(milestones: { tier: string; achieved: boolean }[]): {
  tiers: TierStat[]; nextTier: Level | null; toNext: number; earned: number; total: number;
} {
  const tiers: TierStat[] = LEVELS.map((tier) => {
    const inTier = milestones.filter((m) => m.tier === tier);
    return { tier, done: inTier.filter((m) => m.achieved).length, total: inTier.length };
  });
  const next = tiers.find((t) => t.total > 0 && t.done < t.total) ?? null;
  return {
    tiers, nextTier: next ? next.tier : null, toNext: next ? next.total - next.done : 0,
    earned: tiers.reduce((s, t) => s + t.done, 0), total: tiers.reduce((s, t) => s + t.total, 0),
  };
}

/** The forward pull for the hero/home card: the tier ABOVE the member's current
    level (Beginner if they have none, null if they're already Pro). Avoids the
    "Pro · 6 skills to Beginner" nonsense when a level was set ahead of the ticks. */
export function nextTierFrom(level: string | null, tiers: TierStat[]): { nextTier: Level | null; toNext: number; pct: number } {
  const idx = level ? LEVELS.indexOf(level as Level) : -1;
  const next = idx === -1 ? LEVELS[0] : idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
  if (!next) return { nextTier: null, toNext: 0, pct: level ? 100 : 0 };
  const stat = tiers.find((t) => t.tier === next);
  const total = stat?.total ?? 0, done = stat?.done ?? 0;
  return { nextTier: next, toNext: total - done, pct: total ? (done / total) * 100 : 0 };
}
