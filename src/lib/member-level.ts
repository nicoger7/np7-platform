/* Member level model — pure (no server imports), shared by the portal data
   layer, the member + admin routes, and the client UI. One overall level per
   member with provenance: self → coach-suggested → coach-verified. A "suggested"
   status is private; the displayed (public) level falls back to the member's
   self-declared value until they accept. */

import { RANKS } from "./progression";

/** ONE taxonomy everywhere: the member-progression rank ladder (6 ranks,
    Beginner → … → Pro) is the single source — level pickers, badges and the
    spotguide all derive from it. Old 4-level data stays valid (a subset). */
export const LEVELS = RANKS;
export type Level = (typeof LEVELS)[number];

/** One-line, plain-English definition of each level — shared everywhere a level
    is shown or picked (member area + spotguide). */
export const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  Beginner: "Uphauling, sailing both ways and basic steering — not yet planing.",
  Intermediate: "Planing in the harness & footstraps; learning the carve gybe.",
  Advanced: "Confident planing, waterstart & carve gybes; into waves or freestyle.",
  Expert: "Dialled-in all-rounder — carve gybes both ways, solid in strong wind & chop.",
  "Semi-Pro": "Advanced moves land reliably — race pace, jumps or a first wave/freestyle repertoire.",
  Pro: "Masters most conditions — advanced waves, freestyle or racing.",
};
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

/** A verified skill with its tier — lets every surface batch skills by category
    (Beginner→Pro) instead of showing one flat, seemingly-random list. */
export type SkillTag = { label: string; tier: string };

/** Sort key for a tier name (unknown tiers sort last). */
export function tierRank(tier: string): number {
  const i = (LEVELS as readonly string[]).indexOf(tier);
  return i === -1 ? LEVELS.length : i;
}

/** Group skill tags into tier buckets in canonical order, dropping empty tiers. */
export function groupSkillsByTier(skills: SkillTag[]): { tier: Level; items: SkillTag[] }[] {
  const by = new Map<string, SkillTag[]>();
  for (const s of skills) by.set(s.tier, [...(by.get(s.tier) ?? []), s]);
  return LEVELS.filter((t) => by.has(t)).map((t) => ({ tier: t, items: by.get(t)! }));
}

/**
 * The level you're AT = the tier you're currently working on: the first tier whose
 * milestones aren't all ticked (you graduate a tier by completing it, e.g. all
 * Beginner skills done → you're Intermediate, working on Intermediate). When every
 * tier is complete you're at the top tier; null only when there's no catalog.
 * The coach can always override up or down.
 */
export function deriveSuggestedLevel(catalog: Milestone[], achievedIds: Set<string>): Level | null {
  let lastComplete: Level | null = null;
  for (const tier of LEVELS) {
    const inTier = catalog.filter((m) => m.tier === tier);
    if (inTier.length === 0) continue;
    if (inTier.every((m) => achievedIds.has(m.id))) { lastComplete = tier; continue; }
    return tier; // first tier not fully ticked — the one you're earning now
  }
  return lastComplete; // everything ticked → top tier
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
