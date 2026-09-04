/**
 * Where a milestone sits inside its lane.
 *
 * Every milestone was pinned to one row, so two of them a week apart with long
 * names printed straight through each other. This packs a lane into as many
 * rows as it needs: an item drops to the next row down only when it would
 * collide with something already placed on this one.
 *
 * Pure, so the collision arithmetic can be tested without a browser.
 */

export type Placeable = {
  id: string;
  starts_on: string;
  ends_on: string | null;
  title: string;
  amount_net: number | null;
};

export type Placed<T> = { item: T; row: number };

/**
 * Roughly how wide a milestone draws, label included.
 *
 * Measuring it properly needs the DOM. This over-estimates a little, which is
 * the safe direction to be wrong: the cost of guessing too wide is a row that
 * did not strictly need to exist, and the cost of guessing too narrow is the
 * overlap this exists to prevent.
 */
export function estimateExtent(
  item: Placeable,
  x: (d: string) => number,
  formatAmount: (n: number) => string,
): number {
  if (item.ends_on) return Math.max(24, x(item.ends_on) - x(item.starts_on));
  const amount = item.amount_net ? ` · ${formatAmount(Number(item.amount_net))}` : "";
  return 20 + (item.title.length + amount.length) * 6.1;
}

/**
 * First-fit packing, earliest first. Returns each item with its row and how
 * many rows the lane ended up needing.
 */
export function packLane<T extends Placeable>(
  items: T[],
  x: (d: string) => number,
  extent: (item: T) => number,
  gap = 10,
): { placed: Placed<T>[]; rows: number } {
  const rowEnds: number[] = [];
  const placed = [...items]
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.id.localeCompare(b.id))
    .map((item) => {
      const left = x(item.starts_on);
      const right = left + extent(item) + gap;
      // The first row whose content ends at or before this item starts.
      let row = rowEnds.findIndex((end) => end <= left);
      if (row === -1) { row = rowEnds.length; rowEnds.push(right); } else rowEnds[row] = right;
      return { item, row };
    });
  return { placed, rows: Math.max(1, rowEnds.length) };
}
