/**
 * The NP7 fin selector — pure sizing logic, shared by the /hardware/fins tool.
 *
 * v1 covers SLALOM. The model blends the two rules every slalom sailor knows —
 * fin follows board width, fin follows sail size — then nudges for rider
 * weight, wind band and level. All constants live in TUNING so Nico can adjust
 * the behaviour in one place; the UI explains each contribution honestly.
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

export type FinResult = {
  /** the single number the tool recommends, rounded to 0.5 cm */
  idealCm: number;
  /** honest window — one size up/down still works */
  minCm: number;
  maxCm: number;
  /** plain-language "why" lines, one per factor that moved the number */
  notes: string[];
  /** set when board and sail sizes don't belong together */
  comboWarning: string | null;
};

/**
 * Constants calibrated against published slalom sizing practice — above all
 * Nico's own NP7 fin size guide (62.5 cm board → 32 · 72 → 37 · 85 → 45),
 * cross-checked with Point-7's PWA rider tables, Starboard iSonic ranges and
 * pro quiver data (≈2 cm of fin per m² within one board; ~1.5 cm per 10 kg
 * of rider; light wind +2 / strong −1.5). Adjust behaviour here, nowhere else.
 */
export const TUNING = {
  // base: fin follows the board — width/2 + offset (matches the NP7 guide)
  widthHalfOffset: 3.5,
  // cm of fin per m² away from the board's TYPICAL sail (within-board slope)
  sailDeltaSlope: 2,
  sailDeltaCapCm: 3,
  // cm per kg away from the 80 kg reference rider (≈1.5 cm / 10 kg, capped)
  weightPerKg: 0.15,
  weightCapCm: 4,
  weightRefKg: 80,
  // wind bands: light wind wants lift, strong wind wants control (asymmetric —
  // lost lift costs more than control)
  windAdj: { light: 2, medium: 0, strong: -1.5 } as Record<WindBand, number>,
  // intermediates get a touch more fin (earlier planing, easier upwind);
  // pros trim it for top-end control
  levelAdj: { intermediate: 1.5, advanced: 0, pro: -1 } as Record<RiderLevel, number>,
  clampMin: 24,
  clampMax: 52,
  // sail distance from the board's typical pairing that triggers the honest warning
  comboSlack: 1.6,
};

const round05 = (n: number) => Math.round(n * 2) / 2;

/** The sail size a slalom board of this width is typically ridden with. */
export function typicalSailFor(boardWidthCm: number): number {
  // 45 cm ≈ 5.1 · 63 cm ≈ 7.0 · 85 cm ≈ 9.3 — linear fit through slalom practice
  return round05(0.105 * boardWidthCm + 0.35);
}

export function recommendFin(i: FinInputs): FinResult {
  const t = TUNING;
  const base = i.boardWidthCm / 2 + t.widthHalfOffset;
  const typicalSail = typicalSailFor(i.boardWidthCm);
  const sailAdj = Math.max(-t.sailDeltaCapCm, Math.min(t.sailDeltaCapCm, (i.sailSqm - typicalSail) * t.sailDeltaSlope));

  const weightAdj = Math.max(-t.weightCapCm, Math.min(t.weightCapCm, (i.weightKg - t.weightRefKg) * t.weightPerKg));
  const windAdj = t.windAdj[i.wind];
  const levelAdj = t.levelAdj[i.level];

  const ideal = round05(Math.max(t.clampMin, Math.min(t.clampMax, base + sailAdj + weightAdj + windAdj + levelAdj)));

  const notes: string[] = [
    `Your ${i.boardWidthCm} cm board carries ~${round05(base)} cm at its typical sail (~${typicalSail.toFixed(1)} m²)`,
  ];
  if (Math.abs(sailAdj) >= 0.5) {
    notes.push(sailAdj > 0
      ? `+${round05(sailAdj)} cm — ${i.sailSqm.toFixed(1)} m² is more sail than typical for this width`
      : `−${round05(Math.abs(sailAdj))} cm — ${i.sailSqm.toFixed(1)} m² is less sail than typical for this width`);
  }
  if (Math.abs(weightAdj) >= 0.5) notes.push(`${i.weightKg} kg: ${weightAdj > 0 ? "+" : "−"}${round05(Math.abs(weightAdj))} cm for your weight`);
  if (windAdj !== 0) notes.push(i.wind === "light" ? "+2 cm for light-wind lift & early planing" : "−1.5 cm for strong-wind control");
  if (levelAdj !== 0) notes.push(levelAdj > 0 ? "+1.5 cm — a touch more fin makes planing and upwind easier" : "−1 cm — pro trim for top-end control");

  const expectedSail = typicalSailFor(i.boardWidthCm);
  const comboWarning =
    Math.abs(i.sailSqm - expectedSail) > t.comboSlack
      ? `Unusual combo — a ${i.boardWidthCm} cm slalom board is usually ridden around ${expectedSail.toFixed(1)} m². The number still computes, but double-check the pairing.`
      : null;

  return { idealCm: ideal, minCm: ideal - 1, maxCm: ideal + 1, notes, comboWarning };
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
