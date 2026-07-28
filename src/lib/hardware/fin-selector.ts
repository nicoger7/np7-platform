/**
 * The NP7 fin selector — pure sizing logic, shared by the /hardware/fins tool
 * and the admin tuning builder.
 *
 * THE RULE (Nico's, for high-end racing carbon fins like the Rockstar):
 *   middle  = board width / 2 + ~1.5 cm   (72 cm board → 36 → perfect middle 37–38)
 *   fine-tuning (sail vs typical rig, weight, wind, level) moves AT MOST ±2 cm
 *   hard band = width/2 − 1 … width/2 + 4  (72 → min-min 35, max-max 40)
 *
 * Every knob lives in FinTuning. DEFAULT_TUNING is the race-carbon rule; other
 * fin models can override per product via hw_products.selector_tuning (edited
 * in the admin product builder) — merged by normalizeTuning().
 */

export type WindBand = "light" | "medium" | "strong";
export type RiderLevel = "intermediate" | "advanced" | "pro";

export type FinInputs = {
  weightKg: number;
  level: RiderLevel;
  wind: WindBand;
  boardWidthCm: number;
  sailSqm: number;
};

export type FinTuning = {
  /** cm added to width/2 → the "perfect middle" (race carbon: +1.5) */
  centerOffset: number;
  /** max total fine-tune distance from the middle, in cm (race carbon: 2) */
  adjRange: number;
  /** hard floor/ceiling as offsets from width/2 (race carbon: −1 / +4) */
  hardMinOffset: number;
  hardMaxOffset: number;
  /** cm per m² away from the board's typical rig (capped) */
  sailDeltaSlope: number;
  sailDeltaCapCm: number;
  /** cm per kg away from the reference rider (capped) */
  weightPerKg: number;
  weightCapCm: number;
  weightRefKg: number;
  windAdj: Record<WindBand, number>;
  levelAdj: Record<RiderLevel, number>;
  /** the board-width → typical-sail pairing (m² = slope×cm + offset) — drives
   *  only the sail fine-tune and the unusual-combo warning, never the base */
  typicalSailSlope: number;
  typicalSailOffset: number;
  /** the OK sail window around typical, in m² (asymmetric — Nico: a 63 cm/7.0
   *  board rides fine down to 5.0 but 8.0 is already the limit) */
  comboSlackUp: number;
  comboSlackDown: number;
};

export const DEFAULT_TUNING: FinTuning = {
  centerOffset: 1.5,
  adjRange: 2,
  hardMinOffset: -1,
  hardMaxOffset: 4,
  sailDeltaSlope: 1.5,
  sailDeltaCapCm: 2,
  weightPerKg: 0.075, // ±0.75 cm per 10 kg
  weightCapCm: 1.5,
  weightRefKg: 80,
  windAdj: { light: 1, medium: 0, strong: -1 },
  levelAdj: { intermediate: 0.5, advanced: 0, pro: -0.5 },
  // interpolated through common slalom pairings (55→6.1 · 63→7.0 · 85→9.3 ·
  // 95→10.3) — a working assumption, NOT a published rule; tune to taste
  typicalSailSlope: 0.105,
  typicalSailOffset: 0.35,
  comboSlackUp: 1.0,
  comboSlackDown: 2.0,
};

/** Merge a stored per-product jsonb blob over the default rule, tolerantly. */
export function normalizeTuning(raw: unknown): FinTuning {
  const d = DEFAULT_TUNING;
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const num = (k: keyof FinTuning) => (typeof r[k] === "number" && Number.isFinite(r[k] as number) ? (r[k] as number) : (d[k] as number));
  const band = <T extends string>(k: "windAdj" | "levelAdj", keys: readonly T[]): Record<T, number> => {
    const src = (r[k] ?? {}) as Record<string, unknown>;
    const base = d[k] as Record<string, number>;
    return Object.fromEntries(keys.map((x) => [x, typeof src[x] === "number" && Number.isFinite(src[x] as number) ? (src[x] as number) : base[x]])) as Record<T, number>;
  };
  return {
    centerOffset: num("centerOffset"),
    adjRange: num("adjRange"),
    hardMinOffset: num("hardMinOffset"),
    hardMaxOffset: num("hardMaxOffset"),
    sailDeltaSlope: num("sailDeltaSlope"),
    sailDeltaCapCm: num("sailDeltaCapCm"),
    weightPerKg: num("weightPerKg"),
    weightCapCm: num("weightCapCm"),
    weightRefKg: num("weightRefKg"),
    windAdj: band("windAdj", ["light", "medium", "strong"] as const),
    levelAdj: band("levelAdj", ["intermediate", "advanced", "pro"] as const),
    typicalSailSlope: num("typicalSailSlope"),
    typicalSailOffset: num("typicalSailOffset"),
    comboSlackUp: num("comboSlackUp"),
    comboSlackDown: num("comboSlackDown"),
  };
}

export type FinResult = {
  /** the single number the tool recommends, rounded to 0.5 cm */
  idealCm: number;
  /** the perfect-middle for this board, before fine-tuning */
  middleCm: number;
  /** hard band for this board width — never leave it */
  hardMinCm: number;
  hardMaxCm: number;
  /** plain-language "why" lines, one per factor that moved the number */
  notes: string[];
  /** set when board and sail sizes don't belong together */
  comboWarning: string | null;
};

const round05 = (n: number) => Math.round(n * 2) / 2;
const clamp = (lo: number, hi: number, n: number) => Math.max(lo, Math.min(hi, n));

/** The sail size a slalom board of this width is typically ridden with. */
export function typicalSailFor(boardWidthCm: number, t: FinTuning = DEFAULT_TUNING): number {
  return round05(t.typicalSailSlope * boardWidthCm + t.typicalSailOffset);
}

export function recommendFin(i: FinInputs, t: FinTuning = DEFAULT_TUNING): FinResult {
  const middle = i.boardWidthCm / 2 + t.centerOffset;
  const hardMin = round05(i.boardWidthCm / 2 + t.hardMinOffset);
  const hardMax = round05(i.boardWidthCm / 2 + t.hardMaxOffset);

  const typicalSail = typicalSailFor(i.boardWidthCm, t);
  const sailAdj = clamp(-t.sailDeltaCapCm, t.sailDeltaCapCm, (i.sailSqm - typicalSail) * t.sailDeltaSlope);
  const weightAdj = clamp(-t.weightCapCm, t.weightCapCm, (i.weightKg - t.weightRefKg) * t.weightPerKg);
  const windAdj = t.windAdj[i.wind];
  const levelAdj = t.levelAdj[i.level];

  // the rule: fine-tuning never moves more than adjRange off the middle,
  // and the result never leaves the hard band for this board width
  const adj = clamp(-t.adjRange, t.adjRange, sailAdj + weightAdj + windAdj + levelAdj);
  const ideal = round05(clamp(Math.max(24, hardMin), Math.min(52, hardMax), middle + adj));

  const notes: string[] = [
    `${i.boardWidthCm} cm board → perfect middle ~${round05(middle)} cm (width ÷ 2 + ${t.centerOffset})`,
  ];
  if (Math.abs(sailAdj) >= 0.25) {
    notes.push(sailAdj > 0
      ? `+${round05(sailAdj)} — ${i.sailSqm.toFixed(1)} m² is more sail than the typical ~${typicalSail.toFixed(1)} m²`
      : `−${round05(Math.abs(sailAdj))} — ${i.sailSqm.toFixed(1)} m² is less sail than the typical ~${typicalSail.toFixed(1)} m²`);
  }
  if (Math.abs(weightAdj) >= 0.25) notes.push(`${i.weightKg} kg: ${weightAdj > 0 ? "+" : "−"}${round05(Math.abs(weightAdj))} for your weight`);
  if (windAdj !== 0) notes.push(windAdj > 0 ? `+${windAdj} for light-wind lift & early planing` : `−${Math.abs(windAdj)} for strong-wind control`);
  if (levelAdj !== 0) notes.push(levelAdj > 0 ? `+${levelAdj} — a touch more fin makes planing and upwind easier` : `−${Math.abs(levelAdj)} — pro trim for top-end control`);
  notes.push(`Never below ${hardMin} or above ${hardMax} on this board`);

  const comboLo = typicalSail - t.comboSlackDown;
  const comboHi = typicalSail + t.comboSlackUp;
  const comboWarning =
    i.sailSqm > comboHi || i.sailSqm < comboLo
      ? `Unusual combo — a ${i.boardWidthCm} cm board usually carries ${comboLo.toFixed(1)}–${comboHi.toFixed(1)} m². The number still computes, but double-check the pairing.`
      : null;

  return { idealCm: ideal, middleCm: round05(middle), hardMinCm: hardMin, hardMaxCm: hardMax, notes, comboWarning };
}

/** Parse a fin length in cm out of a variant name/attributes ("38", "38 cm", "SL-38"). */
export function variantSizeCm(name: string | null | undefined, attributes?: Record<string, unknown> | null): number | null {
  const a = attributes ?? {};
  for (const k of ["size_cm", "size", "length_cm", "length"]) {
    const v = a[k];
    const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
    if (Number.isFinite(n) && n >= 20 && n <= 60) return n;
  }
  const m = (name ?? "").match(/(\d{2}(?:[.,]\d)?)\s*(?:cm)?\b/);
  if (m) {
    const n = parseFloat(m[1].replace(",", "."));
    if (n >= 20 && n <= 60) return n;
  }
  return null;
}
