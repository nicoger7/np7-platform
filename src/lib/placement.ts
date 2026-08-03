/**
 * Per-shape image framing.
 *
 * A focal point used to be ONE css position for every screen, so the same
 * "50% 40%" had to survive a 2.4:1 desktop banner and a 0.72:1 phone hero — it
 * rarely does. Framing is now kept per shape: DESKTOP is the base, tablet and
 * phone inherit it until they are given their own.
 *
 * Storage stays back-compatible (migration 137): the existing text column keeps
 * holding the plain desktop string for readers that drop it straight into CSS,
 * and only the overrides live in the sibling `*_shapes` jsonb column. The parser
 * below still accepts a whole JSON map in place of that string, so a value
 * written the other way round resolves too.
 */

import type { CSSProperties } from "react";

export const FOCUS_SHAPES = ["desktop", "tablet", "phone"] as const;
export type FocusShape = (typeof FOCUS_SHAPES)[number];

/** A css position per shape. null = inherit desktop (and a null desktop = centred). */
export type ShapeFocus = Record<FocusShape, string | null>;

export const EMPTY_FOCUS: ShapeFocus = { desktop: null, tablet: null, phone: null };

function asMap(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* not JSON after all — treated as a plain css string below */ }
  }
  return null;
}

/**
 * Read framing from any of the shapes it is stored/transported in: a plain css
 * string, a JSON map, or the base string + its overrides map.
 */
export function parseFocus(value?: unknown, shapes?: unknown): ShapeFocus {
  const out: ShapeFocus = { ...EMPTY_FOCUS };
  const apply = (m: Record<string, unknown>) => {
    for (const s of FOCUS_SHAPES) {
      const v = m[s];
      if (typeof v === "string" && v.trim()) out[s] = v.trim();
    }
  };
  const map = asMap(value);
  if (map) apply(map);
  else if (typeof value === "string" && value.trim()) out.desktop = value.trim();
  const overrides = asMap(shapes);
  if (overrides) apply(overrides);
  return out;
}

/** The css position that actually applies to a shape (after inheritance). */
export function focusOf(f: ShapeFocus, shape: FocusShape): string | null {
  return f[shape] ?? f.desktop;
}

/** True when the shape carries framing of its own rather than the desktop's. */
export function hasOwnFocus(f: ShapeFocus, shape: FocusShape): boolean {
  return f[shape] != null;
}

/** The applied position as x/y percentages — what the editor draws its dot at. */
export function focusPoint(f: ShapeFocus, shape: FocusShape): [number, number] {
  const v = focusOf(f, shape);
  const m = v?.match(/(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?/);
  return m ? [Number(m[1]), Number(m[2])] : [50, 50];
}

export function withFocus(f: ShapeFocus, shape: FocusShape, css: string | null): ShapeFocus {
  return { ...f, [shape]: css };
}

/**
 * Back to a single string: plain css while every shape follows the desktop
 * (so nothing changes for framing that never needed per-shape values), a JSON
 * map once one of them doesn't.
 */
export function encodeFocus(f: ShapeFocus): string | null {
  const overrides = FOCUS_SHAPES.filter((s) => s !== "desktop" && f[s]);
  if (!overrides.length) return f.desktop;
  const map: Record<string, string> = {};
  for (const s of FOCUS_SHAPES) if (f[s]) map[s] = f[s] as string;
  return JSON.stringify(map);
}

/** Storage split: the base column keeps the desktop string, the jsonb the rest. */
export function splitFocus(value: unknown): { base: string | null; shapes: Record<string, string> } {
  const f = parseFocus(value);
  const shapes: Record<string, string> = {};
  for (const s of FOCUS_SHAPES) if (s !== "desktop" && f[s]) shapes[s] = f[s] as string;
  return { base: f.desktop, shapes };
}

/** The inverse — what the editor gets handed back. */
export function mergeFocus(base: unknown, shapes: unknown): string | null {
  return encodeFocus(parseFocus(base, shapes));
}

/* ── Rendering ──────────────────────────────────────────────────────────────
   Media queries pick the shape, not javascript: the value is resolved by the
   browser at paint time, so it survives ISR, needs no client bundle and can't
   flash the wrong crop on load. Unset shapes fall through the var() chain to
   the desktop value, which IS the inheritance rule.                          */

export const FOCUS_CLASS = "np7-focus";

/** Breakpoints match Tailwind's sm/lg, i.e. the shapes the editor previews. */
export const FOCUS_CSS =
  `.${FOCUS_CLASS}{background-position:var(--np7-focus-phone,var(--np7-focus-desktop,center))}` +
  `@media (min-width:640px){.${FOCUS_CLASS}{background-position:var(--np7-focus-tablet,var(--np7-focus-desktop,center))}}` +
  `@media (min-width:1024px){.${FOCUS_CLASS}{background-position:var(--np7-focus-desktop,center)}}`;

export function focusVars(f: ShapeFocus): CSSProperties {
  const vars: Record<string, string> = {};
  for (const s of FOCUS_SHAPES) if (f[s]) vars[`--np7-focus-${s}`] = f[s] as string;
  return vars as CSSProperties;
}
