/**
 * Spotguide registry — the single source of truth for the member-interactive
 * spot guide. Pure module (no JSX, no server deps) so the admin editor, the
 * public renderer, the portal APIs and the aggregation layer all import the
 * SAME criteria, forecast-model list and helpers. Change a criterion here and
 * every surface follows.
 *
 * Data model (migration 062):
 *   destinations (existing) → spots → { spot_ratings, spot_forecast_votes,
 *   spot_verifications, spot_photos } + destination_ratings.
 *
 * Levels reference the member taxonomy (member-level.ts LEVELS) so a level
 * change there propagates here automatically — they are never hardcoded.
 */

import { LEVELS, type Level } from "@/lib/member-level";
// The windrose model is identical to the magazine's — reuse it, don't fork.
import {
  WIND_DIRECTIONS,
  WIND_QUALITY_META,
  asWindWindow,
  windWindowHasValue,
  bestWinds,
  type WindWindow,
  type WindDir,
  type WindQuality,
} from "@/lib/blog-templates";

export {
  WIND_DIRECTIONS,
  WIND_QUALITY_META,
  asWindWindow,
  windWindowHasValue,
  bestWinds,
};
export type { WindWindow, WindDir, WindQuality };
export { LEVELS };
export type { Level };

/* ------------------------------------------------------------------ */
/* Rating criteria — two different axes for the two layers.           */
/* ------------------------------------------------------------------ */

export type Criterion = { key: string; label: string; hint: string };

/** SPOT star criteria — season-independent opinions only. Wind is NOT rated
    (the Open-Meteo climatology chart is the objective wind signal); conditions,
    level and wind-direction are collected as crowd FACTS instead (see below). */
export const SPOT_CRITERIA: Criterion[] = [
  { key: "safety", label: "Safety", hint: "Onshore & safe vs offshore wind, rocks, currents, hazards." },
  { key: "beauty", label: "View", hint: "Scenery / landscape and the all-round vibe on the water." },
  { key: "infrastructure", label: "Infrastructure", hint: "School, rental, repair, parking, beach bar — what's on the ground." },
  { key: "family", label: "Family-friendly", hint: "Shallow areas, easy launch, room for kids & non-sailors." },
];

/** DESTINATION star criteria (whole-trip). Wind is not rated — it's the spots'
    objective climatology aggregated. */
export const DESTINATION_CRITERIA: Criterion[] = [
  { key: "stay_food", label: "Stay & food", hint: "Accommodation and eating — where you sleep and dine." },
  { key: "no_wind_days", label: "No-wind days", hint: "What there is to do when the wind doesn't show." },
  { key: "family", label: "Family-friendly", hint: "How well it works for families and non-sailing partners." },
  { key: "value", label: "Value for money", hint: "What you get for what you spend." },
  { key: "vibe", label: "Vibe", hint: "The overall feel of the place." },
  // Cost LEVEL, not a quality score: shown as $ symbols (1 $ budget … 5 $
  // premium) and excluded from the overall star average.
  { key: "price", label: "Price level", hint: "1 $ = budget · 5 $ = premium." },
];

/** Descriptive scales (not quality) — kept OUT of the overall star averages. */
export const NON_QUALITY_KEYS = new Set<string>(["price"]);

export const SPOT_CRITERIA_KEYS = SPOT_CRITERIA.map((c) => c.key);
export const DESTINATION_CRITERIA_KEYS = DESTINATION_CRITERIA.map((c) => c.key);

/* ------------------------------------------------------------------ */
/* Conditions — the water state (absorbs the old "water type").       */
/* ------------------------------------------------------------------ */

export const CONDITIONS = [
  { key: "flat", label: "Flat water" },
  { key: "chop", label: "Choppy" },
  { key: "small_waves", label: "Small waves (0.5–1 m)" },
  { key: "medium_waves", label: "Medium waves (1–2 m)" },
  { key: "big_waves", label: "Big waves (2 m+)" },
  { key: "shallow", label: "Shallow" },
  { key: "deep", label: "Deep water" },
] as const;
export type ConditionKey = (typeof CONDITIONS)[number]["key"];

// Older data used coarse keys; keep them readable if they still appear.
const LEGACY_CONDITIONS: Record<string, string> = { waves: "Waves", mixed: "Mixed" };
export function conditionLabel(key: string): string {
  return CONDITIONS.find((c) => c.key === key)?.label ?? LEGACY_CONDITIONS[key] ?? key;
}

/* ------------------------------------------------------------------ */
/* Infrastructure tags — a suggested vocabulary (free additions ok).  */
/* ------------------------------------------------------------------ */

export const INFRASTRUCTURE_TAGS = [
  "Windsurf center", "School", "Rental", "Repair", "Storage", "Parking",
  "Toilets", "Showers", "Beach bar", "Restaurant", "Rescue / lifeguard", "Shop",
] as const;

/* ------------------------------------------------------------------ */
/* Forecast models — the curated list riders actually pick from.      */
/* In most wind apps you can choose which model to display; this is    */
/* that list, plus the aggregators riders read it in. NP7 sets its     */
/* recommendation; members vote their favourite (spot_forecast_votes). */
/* ------------------------------------------------------------------ */

export type ForecastTier = "global" | "highres" | "app";
export type ForecastModel = { id: string; label: string; tier: ForecastTier; note?: string };

export const FORECAST_MODELS: ForecastModel[] = [
  // Global models
  { id: "gfs", label: "GFS", tier: "global", note: "NOAA · global, free, the default everywhere" },
  { id: "ecmwf", label: "ECMWF (IFS)", tier: "global", note: "Often the most accurate global model" },
  { id: "icon", label: "ICON", tier: "global", note: "DWD global" },
  { id: "ukmo", label: "UKMO", tier: "global", note: "UK Met Office global" },
  { id: "gem", label: "GEM", tier: "global", note: "Environment Canada global" },
  // High-resolution / local — best for thermal & coastal spots
  { id: "icon_d2", label: "ICON-D2", tier: "highres", note: "DWD ~2 km, central Europe" },
  { id: "icon_eu", label: "ICON-EU", tier: "highres", note: "DWD ~7 km, Europe" },
  { id: "arome", label: "AROME", tier: "highres", note: "Météo-France ~1.3 km" },
  { id: "wrf", label: "WRF", tier: "highres", note: "High-res, many local providers" },
  { id: "nam", label: "NAM", tier: "highres", note: "NOAA high-res, North America" },
  { id: "harmonie", label: "HARMONIE", tier: "highres", note: "~2.5 km, NW Europe" },
  // Where riders read it
  { id: "windguru", label: "Windguru", tier: "app", note: "GFS / WRF, the classic" },
  { id: "windy", label: "Windy", tier: "app", note: "Multi-model viewer" },
  { id: "windfinder", label: "Windfinder", tier: "app" },
  { id: "meteoblue", label: "Meteoblue", tier: "app", note: "Multi-model" },
];

export const FORECAST_TIER_LABEL: Record<ForecastTier, string> = {
  global: "Global models",
  highres: "High-resolution (thermal / coastal)",
  app: "Where riders read it",
};

export function forecastModel(id: string): ForecastModel | undefined {
  return FORECAST_MODELS.find((m) => m.id === id);
}
export function forecastLabel(id: string): string {
  return forecastModel(id)?.label ?? id;
}

/* ------------------------------------------------------------------ */
/* Verification ladder.                                               */
/* ------------------------------------------------------------------ */

export type Verification = "pending" | "community" | "np7";
/** Distinct member confirmations that flip a pending spot to community. */
export const COMMUNITY_VERIFY_THRESHOLD = 3;
/** Distinct member flags that auto-hide a photo for NP7 review. */
export const PHOTO_FLAG_THRESHOLD = 3;

export const VERIFICATION_META: Record<Verification, { label: string; short: string; color: string }> = {
  pending: { label: "Awaiting verification", short: "Pending", color: "#9aa6ac" },
  community: { label: "Verified by members who've sailed here", short: "Community", color: "#1f9e57" },
  np7: { label: "Tested by NP7 — we've been here", short: "✓ Verified", color: "#00afdb" },
};

export function isPublicVerification(v: string | null | undefined): boolean {
  return v === "community" || v === "np7";
}

/* ------------------------------------------------------------------ */
/* Tolerant readers + aggregation.                                    */
/* ------------------------------------------------------------------ */

function asNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export type RatingMap = Record<string, number>;

/** Read a stored ratings jsonb into a clean { key: 1–5 } map (0 = unset). */
export function asRatingMap(v: unknown, keys: string[]): RatingMap {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out: RatingMap = {};
  for (const k of keys) {
    const n = Math.round(asNum(o[k]));
    if (n >= 1 && n <= 5) out[k] = n;
  }
  return out;
}

export type RatingSummary = {
  /** Per-criterion average across all member rows (0 when no one rated it). */
  byCriterion: RatingMap;
  /** Mean of the per-criterion averages — the headline number. */
  overall: number;
  /** How many members rated this spot/destination at all. */
  count: number;
};

/** Average a set of member rating rows per criterion + overall. */
export function summariseRatings(rows: { ratings: unknown }[], keys: string[]): RatingSummary {
  const sums: Record<string, number> = {};
  const counts: Record<string, number> = {};
  let raters = 0;
  for (const row of rows) {
    const map = asRatingMap(row.ratings, keys);
    const vals = Object.values(map);
    if (vals.length === 0) continue;
    raters++;
    for (const k of keys) {
      if (map[k]) { sums[k] = (sums[k] ?? 0) + map[k]; counts[k] = (counts[k] ?? 0) + 1; }
    }
  }
  const byCriterion: RatingMap = {};
  for (const k of keys) if (counts[k]) byCriterion[k] = round1(sums[k] / counts[k]);
  // Overall = quality criteria only ("price level" is a cost scale, not a score).
  const present = Object.entries(byCriterion).filter(([k]) => !NON_QUALITY_KEYS.has(k)).map(([, v]) => v);
  const overall = present.length ? round1(present.reduce((a, b) => a + b, 0) / present.length) : 0;
  return { byCriterion, overall, count: raters };
}

/** Mean of an NP7 editorial rating map (the single authoritative value). */
export function np7Overall(ratings: unknown, keys: string[]): number {
  const map = asRatingMap(ratings, keys);
  const vals = Object.entries(map).filter(([k]) => !NON_QUALITY_KEYS.has(k)).map(([, v]) => v);
  return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

export type ForecastTally = { model: string; label: string; votes: number; pct: number };

/** Tally forecast votes into a sorted, share-weighted list for the graphic. */
export function tallyForecastVotes(rows: { model: string }[]): ForecastTally[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    const id = (r.model ?? "").trim();
    if (id) by.set(id, (by.get(id) ?? 0) + 1);
  }
  const total = [...by.values()].reduce((a, b) => a + b, 0) || 1;
  return [...by.entries()]
    .map(([model, votes]) => ({ model, label: forecastLabel(model), votes, pct: Math.round((votes / total) * 100) }))
    .sort((a, b) => b.votes - a.votes);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Crowd-aggregated member facts (level / conditions / wind window).  */
/* ------------------------------------------------------------------ */

export type CrowdWindow = { window: WindWindow; counts: Partial<Record<WindDir, number>>; raters: number };
/** Consensus windrose from members' wind_window rows (best=2/good=1/no=0 avg). */
export function crowdWindow(rows: { wind_window?: unknown }[]): CrowdWindow {
  const V: Record<string, number> = { best: 2, good: 1, no: 0 };
  const score: Partial<Record<WindDir, number>> = {};
  const counts: Partial<Record<WindDir, number>> = {};
  let raters = 0;
  for (const r of rows) {
    const w = asWindWindow(r.wind_window);
    if (!windWindowHasValue(w)) continue;
    raters++;
    for (const d of WIND_DIRECTIONS) {
      const q = w[d];
      if (q === "best" || q === "good" || q === "no") { score[d] = (score[d] ?? 0) + V[q]; counts[d] = (counts[d] ?? 0) + 1; }
    }
  }
  const window: WindWindow = {};
  for (const d of WIND_DIRECTIONS) {
    const c = counts[d];
    if (!c) continue;
    const avg = (score[d] ?? 0) / c;
    window[d] = avg >= 1.34 ? "best" : avg >= 0.5 ? "good" : "no";
  }
  return { window, counts, raters };
}

export type LevelConsensus = { modal: string | null; label: string | null; counts: Record<string, number>; raters: number };
/** Members' consensus on the level a spot suits. */
export function levelConsensus(rows: { level?: string | null }[]): LevelConsensus {
  const counts: Record<string, number> = {};
  let raters = 0;
  for (const r of rows) {
    const l = r.level;
    if (l && (LEVELS as readonly string[]).includes(l)) { counts[l] = (counts[l] ?? 0) + 1; raters++; }
  }
  let modal: string | null = null, best = 0;
  for (const l of LEVELS) if ((counts[l] ?? 0) > best) { best = counts[l]!; modal = l; }
  return { modal, label: modal ? `mostly ${modal}` : null, counts, raters };
}

export type ConditionShare = { key: string; label: string; count: number; pct: number };
/** Share of members reporting each water-state at a spot. */
export function conditionsTally(rows: { conditions?: string[] | null }[]): { shares: ConditionShare[]; raters: number } {
  const counts: Record<string, number> = {};
  let raters = 0;
  for (const r of rows) {
    const cs = Array.isArray(r.conditions) ? r.conditions : [];
    if (cs.length === 0) continue;
    raters++;
    for (const c of cs) counts[c] = (counts[c] ?? 0) + 1;
  }
  const shares = CONDITIONS
    .map((c) => ({ key: c.key, label: c.label, count: counts[c.key] ?? 0, pct: raters ? Math.round(((counts[c.key] ?? 0) / raters) * 100) : 0 }))
    .filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  return { shares, raters };
}

/** Level-range label for a destination, e.g. "Beginner–Advanced" or "All levels". */
export function levelRangeLabel(min?: string | null, max?: string | null): string | null {
  const lo = min && (LEVELS as readonly string[]).includes(min) ? min : null;
  const hi = max && (LEVELS as readonly string[]).includes(max) ? max : null;
  if (!lo && !hi) return null;
  if (lo && hi && lo === hi) return lo;
  if (lo && hi) {
    if (lo === LEVELS[0] && hi === LEVELS[LEVELS.length - 1]) return "All levels";
    return `${lo}–${hi}`;
  }
  return lo ?? hi;
}

export function slugifySpot(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
