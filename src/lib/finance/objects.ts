/**
 * What the money was FOR.
 *
 * A category says a cost was freight. A cost object says it was freight for the
 * Slalom range. Only the second can answer "what did this board cost us and
 * what did it earn", because the cost of a board arrives as a mould, a
 * container and a shaper's month, in three different categories.
 *
 * Objects nest, so a figure asked of "Boards" is the sum of everything under it
 * plus whatever was booked to the range directly. Allocation is by SHARE, so a
 * container carrying three ranges is counted once and split.
 */

import { r2 } from "./board";

export type ObjectKind = "range" | "size" | "product" | "project" | "edition" | "overhead";

export type CostObjectNode = {
  id: string;
  name: string;
  kind: ObjectKind | string;
  parentId: string | null;
  depth: number;
  /** Booked straight to this object, excluding anything under it. */
  own: ObjectFigures;
  /** This object plus everything beneath it. What people actually read. */
  total: ObjectFigures;
  children: CostObjectNode[];
};

export type ObjectFigures = {
  revenue: number;
  cogs: number;
  inventory: number;
  opex: number;
  development: number;
  /** revenue − cogs. Only meaningful where cost of sale is recorded. */
  grossProfit: number;
  /** revenue − (cogs + opex + development). Inventory is not a cost yet. */
  contribution: number;
  /** null when the object buys stock faster than it records cost of sale, or
   *  earns nothing. Better an absent number than a confident wrong one. */
  marginPct: number | null;

  /** Units BOUGHT and units SOLD, counted separately because in any one window
   *  they differ: 230 boards ordered against 50 pre-sold. Averaging one number
   *  across both sides would make the unit cost and the unit price both wrong. */
  unitsBought: number;
  unitsSold: number;
  /** What one costs to land: goods and freight only. Overheads and development
   *  do not scale with a unit and are deliberately not in it. */
  unitCost: number | null;
  /** What one sells for, net. */
  unitRevenue: number | null;
  /** The gap. This is the number "what does a Slalom 72 make us" asks for. */
  unitMargin: number | null;
};

const empty = (): ObjectFigures => ({
  revenue: 0, cogs: 0, inventory: 0, opex: 0, development: 0,
  grossProfit: 0, contribution: 0, marginPct: null,
  unitsBought: 0, unitsSold: 0, unitCost: null, unitRevenue: null, unitMargin: null,
});

const add = (a: ObjectFigures, b: ObjectFigures): ObjectFigures => ({
  revenue: r2(a.revenue + b.revenue),
  cogs: r2(a.cogs + b.cogs),
  inventory: r2(a.inventory + b.inventory),
  opex: r2(a.opex + b.opex),
  development: r2(a.development + b.development),
  unitsBought: r2(a.unitsBought + b.unitsBought),
  unitsSold: r2(a.unitsSold + b.unitsSold),
  grossProfit: 0, contribution: 0, marginPct: null,
  unitCost: null, unitRevenue: null, unitMargin: null,
});

function derive(f: ObjectFigures): ObjectFigures {
  f.grossProfit = r2(f.revenue - f.cogs);
  f.contribution = r2(f.revenue - f.cogs - f.opex - f.development);
  // Same rule as the P&L: dividing by an inventory purchase produces something
  // that looks like a margin and is not one.
  f.marginPct =
    f.revenue > 0 && f.cogs > 0 && f.inventory <= f.cogs
      ? Math.round((f.grossProfit / f.revenue) * 1000) / 10
      : null;

  // Per unit. The landed cost of one is goods plus the freight that brought it,
  // over how many were bought; what one earns is revenue over how many were
  // sold. Neither is an average of the other, which is why the counts are two.
  const landed = r2(f.cogs + f.inventory);
  f.unitCost = f.unitsBought > 0 ? r2(landed / f.unitsBought) : null;
  f.unitRevenue = f.unitsSold > 0 ? r2(f.revenue / f.unitsSold) : null;
  f.unitMargin = f.unitCost != null && f.unitRevenue != null ? r2(f.unitRevenue - f.unitCost) : null;
  return f;
}

type RawObject = { id: string; name: string; kind: string; parent_id: string | null; sort: number };
/** One allocated amount: how much of a line or an actual landed on an object. */
export type Contribution = {
  objectId: string; group: string | null; amount: number;
  /** Share-applied units, or 0 when the line does not say how many. */
  quantity?: number;
};

/**
 * Build the tree with both own and rolled-up figures.
 * `contributions` are already share-applied by the caller.
 */
export function buildObjectTree(
  objects: RawObject[],
  contributions: Contribution[],
): CostObjectNode[] {
  const own = new Map<string, ObjectFigures>();
  for (const o of objects) own.set(o.id, empty());

  for (const c of contributions) {
    const f = own.get(c.objectId);
    if (!f) continue;
    const q = c.quantity ?? 0;
    if (q) {
      if (c.group === "revenue") f.unitsSold = r2(f.unitsSold + q);
      else if (c.group === "cogs" || c.group === "inventory") f.unitsBought = r2(f.unitsBought + q);
    }
    switch (c.group) {
      case "revenue": f.revenue = r2(f.revenue + c.amount); break;
      case "cogs": f.cogs = r2(f.cogs + c.amount); break;
      case "inventory": f.inventory = r2(f.inventory + c.amount); break;
      case "development": f.development = r2(f.development + c.amount); break;
      // Financing belongs to no product, so it is deliberately not counted
      // here: it would otherwise inflate whatever object it was tagged with.
      case "financing": break;
      default: f.opex = r2(f.opex + c.amount); break;
    }
  }

  const byParent = new Map<string | null, RawObject[]>();
  for (const o of [...objects].sort((a, b) => a.sort - b.sort)) {
    const k = o.parent_id;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(o);
  }

  const build = (o: RawObject, depth: number): CostObjectNode => {
    const children = (byParent.get(o.id) ?? []).map((c) => build(c, depth + 1));
    const ownF = own.get(o.id) ?? empty();
    let total = { ...ownF };
    for (const c of children) total = add(total, c.total);
    return {
      id: o.id, name: o.name, kind: o.kind, parentId: o.parent_id, depth,
      own: derive({ ...ownF }), total: derive(total), children,
    };
  };

  return (byParent.get(null) ?? []).map((o) => build(o, 0));
}

/** Flatten for a table, parents before their children. */
export function flattenTree(nodes: CostObjectNode[]): CostObjectNode[] {
  const out: CostObjectNode[] = [];
  const walk = (n: CostObjectNode) => { out.push(n); n.children.forEach(walk); };
  nodes.forEach(walk);
  return out;
}
