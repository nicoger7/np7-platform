/* Progression system — discipline tracks over the level_milestones catalog, with
   per-skill difficulty scores, prerequisite unlocks, and a three-tier verification:
   self (logged) → windcoach (video) → coach (on an NP7 trip = the gold standard).

   Core = Freeride · Freerace · Slalom; waves/freestyle/foil are 'side' skills.
   Pure module (no server imports) — the portal loader feeds it rows, the client
   view renders the result. Ties into the existing Beginner→Pro ladder via the
   grade → level roll-up. See [[project-member-area-decisions]] / [[windcoach-integration]]. */

export const CORE_DISCIPLINES = ["freeride", "freerace", "slalom"] as const;
export type Discipline = (typeof CORE_DISCIPLINES)[number] | "side";
export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  freeride: "Freeride", freerace: "Freerace", slalom: "Slalom", side: "Side skills",
};

export type VerifiedVia = "self" | "windcoach" | "coach";
/** Coach-verified on a trip is worth the most — the path we want riders to chase.
    Only verified skills (windcoach/coach) unlock the next one; self-logging alone
    doesn't progress you. */
export const VERIFY_WEIGHT: Record<VerifiedVia, number> = { self: 0.4, windcoach: 1, coach: 1.3 };
export const VERIFY_LABEL: Record<VerifiedVia, string> = { self: "Logged", windcoach: "wind.coach", coach: "Coach" };
export function isVerified(v: VerifiedVia): boolean { return v === "windcoach" || v === "coach"; }

export type CatalogSkill = {
  id: string; key: string; label: string; tier: string;
  discipline: Discipline; difficulty: number; prerequisite_key: string | null; sort_order: number;
};
export type Achievement = { milestone_id: string; verified_via: VerifiedVia; verified_ref?: string | null };

export type SkillState = VerifiedVia | "available" | "locked";
export type ProgressSkill = CatalogSkill & { state: SkillState; prereqLabel: string | null };
export type Track = { discipline: Discipline; label: string; skills: ProgressSkill[]; verified: number; total: number; points: number };
export type Progression = {
  grade: number;
  level: { name: string; pct: number; toNext: number; nextName: string | null };
  coachCount: number; windcoachCount: number;
  tracks: Track[];     // core disciplines, in order, non-empty only
  side: Track | null;  // side skills (collapsed in the UI)
};

/** Fallback discipline when the DB `discipline` isn't a known track — e.g. before
    migration 068 relabels the catalog from 'windsurf'. Keyed by the stable
    milestone key so the page groups sensibly either way. */
const KEY_DISCIPLINE: Record<string, Discipline> = {
  bg_uphaul: "freeride", bg_rigging: "freeride", bg_steering: "freeride", bg_beachstart: "freeride", bg_upwind: "freeride", bg_goreturn: "freeride",
  im_planing: "freeride", im_frontstrap: "freeride", im_backstrap: "freeride", im_harness: "freeride", im_tack: "freeride", im_jibeentry: "freeride", im_nonplaningjibe: "freeride", im_trim: "freeride", im_waterstart: "freeride",
  ad_carvejibe: "freeride", ad_chophop: "freeride", ad_underpowered: "freeride",
  im_railing: "freerace", im_20kn: "freerace", im_20knctrl: "freerace", im_25kn: "freerace", im_25knctrl: "freerace",
  ad_tuning: "freerace", ad_overpowered: "freerace", ad_duckjibe: "freerace", ad_30kn: "freerace", ad_30knctrl: "freerace", ad_boardflying: "freerace", pro_powerjibe: "freerace",
  pro_racingbasics: "slalom", pro_racingadv: "slalom", pro_35kn: "slalom", pro_35knctrl: "slalom", pro_40knctrl: "slalom",
};
export function normalizeDiscipline(key: string, raw: unknown): Discipline {
  const d = String(raw ?? "");
  if (d === "freeride" || d === "freerace" || d === "slalom" || d === "side") return d;
  return KEY_DISCIPLINE[key] ?? "side";
}

const LEVEL_BANDS: [string, number, number][] = [
  ["Beginner", 0, 120], ["Intermediate", 120, 420], ["Advanced", 420, 950], ["Pro", 950, 1500],
];
export function gradeLevel(grade: number): Progression["level"] {
  if (grade >= 1500) return { name: "Off the scale", pct: 100, toNext: 0, nextName: null };
  for (let i = 0; i < LEVEL_BANDS.length; i++) {
    const [name, a, b] = LEVEL_BANDS[i];
    if (grade < b) return { name, pct: Math.round(((grade - a) / (b - a)) * 100), toNext: b - grade, nextName: LEVEL_BANDS[i + 1]?.[0] ?? "Off the scale" };
  }
  return { name: "Pro", pct: 100, toNext: 0, nextName: null };
}

export function buildProgression(catalogRaw: CatalogSkill[], achievements: Achievement[]): Progression {
  const catalog = catalogRaw.map((m) => ({ ...m, discipline: normalizeDiscipline(m.key, m.discipline) }));
  const byId = new Map(catalog.map((m) => [m.id, m] as const));
  const ach = new Map<string, VerifiedVia>();
  for (const a of achievements) if (byId.has(a.milestone_id)) ach.set(a.milestone_id, a.verified_via);

  // Only verified skills (windcoach/coach) unlock their dependents.
  const verifiedKeys = new Set(catalog.filter((m) => { const v = ach.get(m.id); return !!v && isVerified(v); }).map((m) => m.key));
  const labelByKey = new Map(catalog.map((m) => [m.key, m.label] as const));

  let grade = 0, coachCount = 0, windcoachCount = 0;
  const skills: ProgressSkill[] = catalog.map((m) => {
    const v = ach.get(m.id);
    let state: SkillState;
    if (v) { state = v; grade += Math.round(m.difficulty * VERIFY_WEIGHT[v]); if (v === "coach") coachCount++; if (v === "windcoach") windcoachCount++; }
    else state = !m.prerequisite_key || verifiedKeys.has(m.prerequisite_key) ? "available" : "locked";
    return { ...m, state, prereqLabel: m.prerequisite_key ? (labelByKey.get(m.prerequisite_key) ?? null) : null };
  });

  const makeTrack = (d: Discipline): Track => {
    const s = skills.filter((x) => x.discipline === d).sort((a, b) => a.sort_order - b.sort_order);
    return {
      discipline: d, label: DISCIPLINE_LABEL[d], skills: s,
      verified: s.filter((x) => x.state === "coach" || x.state === "windcoach").length,
      total: s.length,
      points: s.reduce((sum, x) => { const v = ach.get(x.id); return sum + (v ? Math.round(x.difficulty * VERIFY_WEIGHT[v]) : 0); }, 0),
    };
  };
  const tracks = CORE_DISCIPLINES.map(makeTrack).filter((t) => t.total > 0);
  const side = makeTrack("side");
  return { grade, level: gradeLevel(grade), coachCount, windcoachCount, tracks, side: side.total ? side : null };
}
