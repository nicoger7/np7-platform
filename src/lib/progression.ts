/* Progression system — discipline tracks over the level_milestones catalog, with
   prerequisite unlocks and a three-tier verification (self → Wind Coach App video →
   coach on an NP7 trip = the gold standard). Core = Freeride · Freerace · Slalom;
   waves/freestyle are one "Wave & Freestyle" group.

   Rank is earned by MASTERING skills, not by points: each skill sits in a difficulty
   band, and you rank up (Beginner → … → Pro) by verifying every skill in the band.
   So the headline is always "N skills to <next rank>". Pure module — the loader feeds
   rows, the client view renders. See [[project-member-area-decisions]] / [[windcoach-integration]]. */

export const CORE_DISCIPLINES = ["freeride", "freerace", "slalom"] as const;
export type Discipline = (typeof CORE_DISCIPLINES)[number] | "side";
export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  freeride: "Freeride", freerace: "Freerace", slalom: "Slalom", side: "Wave & Freestyle",
};

/** The 6 ranks a rider climbs — earned by mastering each difficulty band in turn. */
export const RANKS = ["Beginner", "Intermediate", "Advanced", "Amateur", "Semi-Pro", "Pro"] as const;
/** Upper difficulty bound of each band (band i → rank i+1 once fully mastered). */
const BAND_MAX = [14, 28, 46, 62, 85, Infinity];
function bandOf(difficulty: number): number { for (let i = 0; i < BAND_MAX.length; i++) if (difficulty <= BAND_MAX[i]) return i; return 5; }
/** The rank a difficulty score sits in — used to keep the legacy `tier` column
    consistent when skills are added/edited in admin, and to band the editor. */
export function rankForDifficulty(difficulty: number): string { return RANKS[bandOf(difficulty)]; }

export type VerifiedVia = "self" | "windcoach" | "coach";
export const VERIFY_LABEL: Record<VerifiedVia, string> = { self: "Logged", windcoach: "Wind Coach App", coach: "Coach" };
export function isVerified(v: VerifiedVia): boolean { return v === "windcoach" || v === "coach"; }

export type CatalogSkill = {
  id: string; key: string; label: string; tier: string;
  discipline: Discipline; difficulty: number; prerequisite_key: string | null; sort_order: number;
};
export type Achievement = { milestone_id: string; verified_via: VerifiedVia; verified_ref?: string | null };

export type SkillState = VerifiedVia | "available" | "locked";
export type ProgressSkill = CatalogSkill & { state: SkillState; prereqLabel: string | null; band: number };
export type Track = { discipline: Discipline; label: string; skills: ProgressSkill[]; verified: number; total: number };
export type LadderRung = { name: string; done: boolean; current: boolean };
export type Progression = {
  level: string;              // current rank
  nextLevel: string | null;   // next rank (null once Pro)
  toNext: number;             // skills still to master to reach nextLevel
  pct: number;                // progress within the working band
  mastered: boolean;          // every core skill verified
  ladder: LadderRung[];       // the 6 ranks with position
  coachCount: number; windcoachCount: number;
  tracks: Track[]; side: Track | null;
};

/** Fallback discipline when the DB `discipline` isn't a known track (e.g. pre-068). */
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

export function buildProgression(catalogRaw: CatalogSkill[], achievements: Achievement[]): Progression {
  const catalog = catalogRaw.map((m) => ({ ...m, discipline: normalizeDiscipline(m.key, m.discipline) }));
  const byId = new Map(catalog.map((m) => [m.id, m] as const));
  const ach = new Map<string, VerifiedVia>();
  for (const a of achievements) if (byId.has(a.milestone_id)) ach.set(a.milestone_id, a.verified_via);

  // ANY logged skill (self included) satisfies prerequisites — the chain guides
  // learning order, but must never stop a rider from self-assessing what they
  // can already do. Only windcoach/coach verification counts toward RANK below.
  const unlockKeys = new Set(catalog.filter((m) => ach.has(m.id)).map((m) => m.key));
  const labelByKey = new Map(catalog.map((m) => [m.key, m.label] as const));

  let coachCount = 0, windcoachCount = 0;
  const skills: ProgressSkill[] = catalog.map((m) => {
    const v = ach.get(m.id);
    let state: SkillState;
    if (v) { state = v; if (v === "coach") coachCount++; if (v === "windcoach") windcoachCount++; }
    else state = !m.prerequisite_key || unlockKeys.has(m.prerequisite_key) ? "available" : "locked";
    return { ...m, state, prereqLabel: m.prerequisite_key ? (labelByKey.get(m.prerequisite_key) ?? null) : null, band: bandOf(m.difficulty) };
  });

  // Rank = how many core difficulty bands you've fully mastered.
  const bands = Array.from({ length: 6 }, () => ({ verified: 0, total: 0 }));
  for (const s of skills) {
    if (s.discipline === "side") continue;
    const b = bands[bandOf(s.difficulty)];
    b.total++;
    if (s.state === "coach" || s.state === "windcoach") b.verified++;
  }
  const complete = (i: number) => bands[i].total === 0 || bands[i].verified === bands[i].total;
  let completed = 0; while (completed < 6 && complete(completed)) completed++;
  const currentIdx = Math.min(completed, 5);
  const wb = Math.min(completed, 5);
  const mastered = completed >= 6;
  const level = RANKS[currentIdx];
  const nextLevel = completed <= 4 ? RANKS[completed + 1] : null;
  const toNext = mastered ? 0 : bands[wb].total - bands[wb].verified;
  // The ring credits self-logged skills at half weight — real claims the rider
  // made (endowed progress), so it's never a dead 0% once they've engaged. RANK
  // and toNext stay verified-only; the ring never hits 100 until truly mastered.
  const selfInWb = skills.filter((s) => s.discipline !== "side" && bandOf(s.difficulty) === wb && s.state === "self").length;
  const pct = mastered ? 100 : bands[wb].total ? Math.min(99, Math.round(((bands[wb].verified + selfInWb * 0.5) / bands[wb].total) * 100)) : 100;
  const ladder: LadderRung[] = RANKS.map((name, i) => ({ name, done: i < currentIdx || mastered, current: i === currentIdx && !mastered }));

  const makeTrack = (d: Discipline): Track => {
    const s = skills.filter((x) => x.discipline === d).sort((a, b) => a.sort_order - b.sort_order);
    return { discipline: d, label: DISCIPLINE_LABEL[d], skills: s, verified: s.filter((x) => x.state === "coach" || x.state === "windcoach").length, total: s.length };
  };
  const tracks = CORE_DISCIPLINES.map(makeTrack).filter((t) => t.total > 0);
  const side = makeTrack("side");
  return { level, nextLevel, toNext, pct, mastered, ladder, coachCount, windcoachCount, tracks, side: side.total ? side : null };
}
