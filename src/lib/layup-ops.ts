/**
 * Pure operations for the layup Baukasten (the drag-and-drop sheet builder).
 *
 * No imports and no DOM on purpose: every gesture in the builder — reorder,
 * insert, resize, stack split/merge — resolves to one of these functions, so
 * the interaction math can be tested headlessly with node instead of by
 * clicking around. The component owns pointers and pixels; this file owns
 * what they mean.
 */

export type BuilderPlyBase = {
  id: string;
  material_id: string;
  orientation: string | null;
  template_ref: string | null;
  length_cm: number | null;
  stack: string | null;
  note: string | null;
};

const norm = (s: string | null | undefined) => s ?? null;

/** Indices i (> 0) where ply i starts a new stack. */
export function stackBoundaries<T extends BuilderPlyBase>(plies: T[]): Set<number> {
  const out = new Set<number>();
  for (let i = 1; i < plies.length; i++) {
    if (norm(plies[i].stack) !== norm(plies[i - 1].stack)) out.add(i);
  }
  return out;
}

const LETTERS = "abcdefghij";

/**
 * Re-letter stacks from a boundary set: segments become a, b, c…
 *
 * With no boundary left, labels collapse to 'a' when any ply was labelled and
 * to null when none were — a sheet that never used stacks shouldn't suddenly
 * grow letters because someone toggled a split on and off.
 */
export function relabelStacks<T extends BuilderPlyBase>(plies: T[], boundaries: Set<number>): T[] {
  if (!plies.length) return plies;
  if (boundaries.size === 0) {
    const label = plies.some((p) => p.stack) ? "a" : null;
    return plies.map((p) => ({ ...p, stack: label }));
  }
  let seg = 0;
  return plies.map((p, i) => {
    if (i > 0 && boundaries.has(i)) seg++;
    return { ...p, stack: LETTERS[Math.min(seg, LETTERS.length - 1)] };
  });
}

/** Toggle "ply `index` starts a new stack" and re-letter. Ply 0 can't split. */
export function withBoundaryToggled<T extends BuilderPlyBase>(plies: T[], index: number): T[] {
  if (index <= 0 || index >= plies.length) return plies;
  const b = stackBoundaries(plies);
  if (b.has(index)) b.delete(index);
  else b.add(index);
  return relabelStacks(plies, b);
}

/**
 * Move a ply to a new position. It ADOPTS the stack of the segment it lands
 * in — keeping its old letter would interleave stacks (a, b, a), which is
 * physically meaningless: a ply is in whichever half of the mold it's in.
 */
export function movePly<T extends BuilderPlyBase>(plies: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= plies.length) return plies;
  const next = [...plies];
  const [moved] = next.splice(from, 1);
  const at = Math.max(0, Math.min(to, next.length));
  const neighbour = at > 0 ? next[at - 1] : next[0];
  next.splice(at, 0, { ...moved, stack: neighbour ? neighbour.stack : moved.stack });
  return relabelStacks(next, stackBoundaries(next));
}

/** Insert a ply at a gap; it adopts the stack of its left neighbour (or right at 0). */
export function insertPly<T extends BuilderPlyBase>(plies: T[], ply: T, at: number): T[] {
  const i = Math.max(0, Math.min(at, plies.length));
  const neighbour = i > 0 ? plies[i - 1] : plies[0];
  const next = [...plies];
  next.splice(i, 0, { ...ply, stack: neighbour ? neighbour.stack : ply.stack });
  return next;
}

/** Duplicate the ply at `index`, placing the copy right after it. */
export function duplicatePly<T extends BuilderPlyBase>(plies: T[], index: number, newId: string): T[] {
  if (index < 0 || index >= plies.length) return plies;
  const next = [...plies];
  next.splice(index + 1, 0, { ...plies[index], id: newId });
  return next;
}

/** Ply lengths live in cm with one decimal; nothing sane is over 120 cm. */
export function clampLength(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(1, Math.min(120, Math.round(v * 10) / 10));
}

/** Which INSERTION GAP (0..count) a pointer x falls on, given the column pitch. */
export function slotFromX(x: number, originX: number, pitch: number, count: number): number {
  return Math.max(0, Math.min(count, Math.round((x - originX) / pitch)));
}

/** Which PLY INDEX (0..count-1) a dragged ply's centre is over. */
export function reorderTarget(x: number, originX: number, pitch: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.floor((x - originX) / pitch)));
}
