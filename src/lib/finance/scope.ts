/**
 * Narrowing the budget to one project, range or size.
 *
 * The trick that makes one filter re-answer every question on the page: rather
 * than teaching each chart about the filter, the LINES are scaled to the share
 * that belongs to the scope and everything downstream is computed from those.
 * The P&L, the cash curve and the timeline then narrow for free.
 *
 * Pure, so the share arithmetic can be tested without a database.
 */

import { r2 } from "./board";

export type ScopableObject = { id: string; parent_id: string | null };
export type Allocation = { sourceId: string; cost_object_id: string; share: number };

/**
 * An object and everything beneath it. Asking for Boards has to include
 * Slalom 72, or a range would report less than the sizes inside it.
 */
export function subtreeOf(objects: ScopableObject[], rootId: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const o of objects) {
    const k = o.parent_id ?? "";
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k)!.push(o.id);
  }
  const out = new Set<string>();
  const walk = (id: string) => {
    if (out.has(id)) return;          // a cycle would otherwise hang the walk
    out.add(id);
    for (const child of kids.get(id) ?? []) walk(child);
  };
  if (objects.some((o) => o.id === rootId)) walk(rootId);
  return out;
}

/**
 * How much of each source row belongs to the scope, as a fraction of 1.
 * Capped, because two allocations to different objects inside the same subtree
 * are two slices of one row and cannot together be more than the whole of it.
 */
export function shareInScope(allocations: Allocation[], scope: Set<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of allocations) {
    if (!scope.has(a.cost_object_id)) continue;
    out.set(a.sourceId, Math.min(1, (out.get(a.sourceId) ?? 0) + (Number(a.share) || 0) / 100));
  }
  return out;
}

/**
 * Keep only what the scope touches, scaled to its share. A row allocated 40% to
 * Slalom contributes 40% of its money, not all of it and not none.
 */
export function scaleToScope<T extends { id: string; amount_net: number | string | null }>(
  rows: T[],
  shares: Map<string, number>,
): T[] {
  return rows
    .filter((r) => (shares.get(r.id) ?? 0) > 0)
    .map((r) => ({ ...r, amount_net: r2((Number(r.amount_net) || 0) * shares.get(r.id)!) }));
}
