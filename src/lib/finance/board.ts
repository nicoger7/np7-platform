/**
 * The budget board: one entity, one year, twelve months.
 *
 * A ROW is a cost or revenue item followed across the year ("Sorobon hotel",
 * "Rent", "Experience revenue"). In the database a row is not a record: it is
 * every fin_plan_lines sharing the same (category, label, edition, vendor), one
 * per month. Keeping the month on the line is what makes each month separately
 * editable, which is the whole point of a plan you adapt.
 *
 * Actuals never write to a plan line. They arrive as their own records and are
 * attached through fin_actual_allocations, so a planned line and what really
 * happened stay independently true and the variance between them is real.
 */

export type Kind = "revenue" | "cost";

export type BoardCategory = {
  id: string;
  key: string;
  name: string;
  kind: Kind;
  sort: number;
  /** Which side of the business plans with it. null means both. */
  division: string | null;
  /** Where it sits in the P&L: revenue | cogs | opex | development. */
  pnl_group: string | null;
};

export type BoardEntity = {
  id: string;
  key: string;
  name: string;
  role: string;
  division: string | null;
  status: string;
  active_from: string | null;
  /** The GmbH carrying this business today, which is not always its own. */
  legal_name: string | null;
  /** When it gets its own legal entity. Null means it already has one. */
  own_entity_from: string | null;
  note: string | null;
};

export type BoardPlan = {
  id: string;
  entity_id: string | null;
  name: string;
  year: number;
  status: string;
  note: string | null;
};

/** One month of one row. `planned` comes from a plan line, `actual` from every
 *  allocation landing in that month. Either can exist without the other. */
export type BoardCell = {
  month: number;          // 1..12
  lineId: string | null;
  planned: number;
  actual: number;
};

export type BoardRow = {
  /** Stable identity of the row, derived from what makes it one item. */
  key: string;
  categoryId: string | null;
  label: string;
  editionId: string | null;
  editionLabel: string | null;
  vendorId: string | null;
  vendorName: string | null;
  confidence: string;
  /** False = kept and shown, but left out of every total. The what-if switch. */
  included: boolean;
  cells: BoardCell[];     // always 12, month 1..12
  plannedTotal: number;
  actualTotal: number;
};

export type BoardGroup = {
  category: BoardCategory | null;
  rows: BoardRow[];
  plannedByMonth: number[];   // 12
  actualByMonth: number[];    // 12
  plannedTotal: number;
  actualTotal: number;
};

/** One P&L line across the year. */
export type PnlLine = { byMonth: number[]; total: number };

/**
 * The P&L the business plan reports, computed from the same rows the grid
 * shows. Revenue less cost of goods gives the gross profit and the margin that
 * actually says whether the products work; operating and development costs sit
 * below it, because they do not scale with a sold unit.
 *
 * `accumulated` is the running position and is the number people reach for
 * first: it answers when money is on the account, not whether the year adds up.
 */
export type Pnl = {
  revenue: PnlLine;
  cogs: PnlLine;
  grossProfit: PnlLine;
  opex: PnlLine;
  development: PnlLine;
  /** Stock bought and the freight that lands it. Money out of the bank, and
   *  NOT a cost in the result until the goods are sold. */
  inventory: PnlLine;
  /** cogs + opex + development. Inventory is not in it. */
  totalCosts: PnlLine;
  /** The trading result. Inventory and financing are deliberately not in it. */
  result: PnlLine;
  /** Share capital, investor tranches, loans. Money in that was not earned, so
   *  it never touches the result or a margin, and always moves the bank. */
  financing: PnlLine;
  /** result + financing, which is what the account actually sees. */
  cashMovement: PnlLine;
  /** Running cash position, month by month. */
  accumulated: number[];
  /** Deepest the position goes. This is the number a year needs funding for. */
  lowestPoint: number;
  grossMarginPct: number | null;
  netMarginPct: number | null;
  /** False when the plan is buying stock faster than it records cost of sale,
   *  which makes any margin off it an artefact rather than a measure. */
  marginMeaningful: boolean;
};

export type Board = {
  entity: BoardEntity | null;
  plan: BoardPlan | null;
  year: number;
  revenue: BoardGroup[];
  cost: BoardGroup[];
  totals: {
    revenuePlanned: number[]; revenueActual: number[];
    costPlanned: number[];    costActual: number[];
    netPlanned: number[];     netActual: number[];
    revenuePlannedTotal: number; revenueActualTotal: number;
    costPlannedTotal: number;    costActualTotal: number;
    netPlannedTotal: number;     netActualTotal: number;
  };
  pnlPlanned: Pnl;
  pnlActual: Pnl;
  /** Rows switched off. Shown so the plan never quietly omits something. */
  excluded: { rows: number; amount: number };
  /** Where the running position starts. Carried in from earlier years later;
   *  0 for now, so `accumulated` is this year's movement. */
  openingBalance: number;
  /** Actuals that landed in this entity+year with nothing to attach them to.
   *  Not an error: an unplanned cost is a finding worth showing. */
  unallocated: {
    id: string; description: string; amount: number; incurred_on: string;
    categoryId: string | null; vendorName: string | null;
  }[];
};

/**
 * Which companies belong to an admin world.
 *
 * Experience and Hardware are becoming separate companies, so the other side's
 * books are not offered here at all. Deselecting them would not be separation;
 * it would just be a default. An unknown world sees everything, which is what
 * the holding view will want later.
 */
export function entitiesForWorld<T extends { division: string | null }>(
  entities: T[],
  world: string | null | undefined,
): T[] {
  if (world !== "experience" && world !== "hardware") return entities;
  return entities.filter((e) => e.division === world);
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const zero12 = () => Array.from({ length: 12 }, () => 0);

/** Rows are grouped by what makes them the same item. Label alone would merge a
 *  hotel planned against two different editions into one misleading row. */
export function rowKey(p: {
  category_id: string | null; label: string; edition_id: string | null; vendor_id: string | null;
}): string {
  return [p.category_id ?? "-", p.label.trim().toLowerCase(), p.edition_id ?? "-", p.vendor_id ?? "-"].join("|");
}

export const monthOf = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const m = Number(String(iso).slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
};

/** First of the month, as the column stores it. */
export const monthDate = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}-01`;

type RawLine = {
  id: string; category_id: string | null; label: string; month: string;
  amount_net: number | string | null; edition_id: string | null; vendor_id: string | null;
  confidence: string | null; included?: boolean | null;
};
type RawAlloc = { plan_line_id: string; amount: number | string | null };
type RawActual = {
  id: string; description: string; amount_net: number | string | null;
  incurred_on: string; category_id: string | null; vendor_id: string | null;
};

const line = (byMonth: number[]): PnlLine => ({
  byMonth,
  total: r2(byMonth.reduce((a, b) => a + b, 0)),
});

const pct = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

/** Assemble one P&L from month sums already bucketed by P&L group. */
function assemblePnl(
  bucket: Record<string, number[]>,
  openingBalance: number,
): Pnl {
  const revenue = line(bucket.revenue);
  const cogs = line(bucket.cogs);
  const opex = line(bucket.opex);
  const development = line(bucket.development);
  const financing = line(bucket.financing);
  const inventory = line(bucket.inventory);
  const grossProfit = line(revenue.byMonth.map((v, i) => r2(v - cogs.byMonth[i])));
  const totalCosts = line(cogs.byMonth.map((v, i) => r2(v + opex.byMonth[i] + development.byMonth[i])));
  const result = line(revenue.byMonth.map((v, i) => r2(v - totalCosts.byMonth[i])));
  // Cash sees everything: the trading result, the stock bought, the money raised.
  const cashMovement = line(result.byMonth.map((v, i) => r2(v - inventory.byMonth[i] + financing.byMonth[i])));

  // A gross margin only means something when the cost of what was sold is
  // recorded. Buying 230 boards to sell 50 is an inventory purchase, and
  // dividing by it produces a number that looks like a margin and is not one.
  const marginMeaningful = cogs.total > 0 && inventory.total <= cogs.total;

  // The running line follows CASH, not the result: a month can lose money and
  // still end richer because a tranche landed, and that is the month you need
  // to see correctly.
  const accumulated: number[] = [];
  let running = openingBalance;
  for (const m of cashMovement.byMonth) { running = r2(running + m); accumulated.push(running); }

  return {
    revenue, cogs, grossProfit, opex, development, totalCosts, result,
    inventory, financing, cashMovement, accumulated,
    lowestPoint: accumulated.length ? Math.min(...accumulated) : 0,
    // Margins are trading measures. Neither financing nor stock is in them.
    grossMarginPct: marginMeaningful ? pct(grossProfit.total, revenue.total) : null,
    netMarginPct: marginMeaningful ? pct(result.total, revenue.total) : null,
    marginMeaningful,
  };
}

export function buildBoard(input: {
  entity: BoardEntity | null;
  plan: BoardPlan | null;
  year: number;
  categories: BoardCategory[];
  lines: RawLine[];
  allocations: RawAlloc[];
  actuals: RawActual[];
  allocatedActualIds: Set<string>;
  editionLabels: Map<string, string>;
  vendorNames: Map<string, string>;
  openingBalance?: number;
}): Board {
  const { entity, plan, year, categories, lines, allocations, actuals } = input;

  // allocation totals per plan line, so an actual attached at 40% counts as 40%
  const allocByLine = new Map<string, number>();
  for (const a of allocations) {
    allocByLine.set(a.plan_line_id, r2((allocByLine.get(a.plan_line_id) || 0) + Number(a.amount || 0)));
  }

  const catById = new Map(categories.map((c) => [c.id, c]));
  const rowsByKey = new Map<string, BoardRow>();

  for (const l of lines) {
    const m = monthOf(l.month);
    if (!m) continue;
    const key = rowKey(l);
    let row = rowsByKey.get(key);
    if (!row) {
      row = {
        key,
        categoryId: l.category_id,
        label: l.label,
        editionId: l.edition_id,
        editionLabel: l.edition_id ? input.editionLabels.get(l.edition_id) ?? null : null,
        vendorId: l.vendor_id,
        vendorName: l.vendor_id ? input.vendorNames.get(l.vendor_id) ?? null : null,
        confidence: l.confidence ?? "expected",
        included: l.included !== false,
        cells: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, lineId: null, planned: 0, actual: 0 })),
        plannedTotal: 0,
        actualTotal: 0,
      };
      rowsByKey.set(key, row);
    }
    // One line switched off switches the row off: a cost you have taken out of
    // the plan is out of it in every month, which is how a person means it.
    if (l.included === false) row.included = false;
    const cell = row.cells[m - 1];
    cell.lineId = l.id;
    cell.planned = r2(cell.planned + Number(l.amount_net || 0));
    cell.actual = r2(cell.actual + (allocByLine.get(l.id) || 0));
  }

  for (const row of rowsByKey.values()) {
    row.plannedTotal = r2(row.cells.reduce((s, c) => s + c.planned, 0));
    row.actualTotal = r2(row.cells.reduce((s, c) => s + c.actual, 0));
  }

  // group rows under their category, keeping the seeded category order
  const groupsFor = (kind: Kind): BoardGroup[] => {
    const cats = categories.filter((c) => c.kind === kind).sort((a, b) => a.sort - b.sort);
    const out: BoardGroup[] = [];
    for (const cat of cats) {
      const rows = [...rowsByKey.values()]
        .filter((r) => r.categoryId === cat.id)
        .sort((a, b) => b.plannedTotal - a.plannedTotal || a.label.localeCompare(b.label));
      if (!rows.length) continue;
      out.push(summarise(cat, rows));
    }
    // anything whose category was deleted still has to appear somewhere
    const orphans = [...rowsByKey.values()].filter(
      (r) => !r.categoryId || !catById.has(r.categoryId),
    );
    if (orphans.length && kind === "cost") out.push(summarise(null, orphans));
    return out;
  };

  function summarise(category: BoardCategory | null, rows: BoardRow[]): BoardGroup {
    const plannedByMonth = zero12();
    const actualByMonth = zero12();
    for (const r of rows) {
      if (!r.included) continue;
      for (let i = 0; i < 12; i++) {
        plannedByMonth[i] = r2(plannedByMonth[i] + r.cells[i].planned);
        actualByMonth[i] = r2(actualByMonth[i] + r.cells[i].actual);
      }
    }
    return {
      category, rows, plannedByMonth, actualByMonth,
      plannedTotal: r2(plannedByMonth.reduce((s, n) => s + n, 0)),
      actualTotal: r2(actualByMonth.reduce((s, n) => s + n, 0)),
    };
  }

  const revenue = groupsFor("revenue");
  const cost = groupsFor("cost");

  // ── P&L: every row counted once, under the line its category belongs to ──
  const GROUPS = ["revenue", "cogs", "inventory", "opex", "development", "financing"] as const;
  const emptyBucket = () => Object.fromEntries(GROUPS.map((g) => [g, zero12()])) as Record<string, number[]>;
  const plannedBucket = emptyBucket();
  const actualBucket = emptyBucket();
  for (const row of rowsByKey.values()) {
    if (!row.included) continue;
    const cat = row.categoryId ? catById.get(row.categoryId) : undefined;
    // An uncategorised cost still has to land somewhere, and overheads is the
    // honest default: counting it as cost of goods would flatter the margin.
    const group = cat?.pnl_group ?? (cat?.kind === "revenue" ? "revenue" : "opex");
    if (!GROUPS.includes(group as typeof GROUPS[number])) continue;
    for (let i = 0; i < 12; i++) {
      plannedBucket[group][i] = r2(plannedBucket[group][i] + row.cells[i].planned);
      actualBucket[group][i] = r2(actualBucket[group][i] + row.cells[i].actual);
    }
  }
  const openingBalance = input.openingBalance ?? 0;
  const pnlPlanned = assemblePnl(plannedBucket, openingBalance);
  const pnlActual = assemblePnl(actualBucket, openingBalance);

  const sumGroups = (gs: BoardGroup[], field: "plannedByMonth" | "actualByMonth") => {
    const out = zero12();
    for (const g of gs) for (let i = 0; i < 12; i++) out[i] = r2(out[i] + g[field][i]);
    return out;
  };
  const revenuePlanned = sumGroups(revenue, "plannedByMonth");
  const revenueActual = sumGroups(revenue, "actualByMonth");
  const costPlanned = sumGroups(cost, "plannedByMonth");
  const costActual = sumGroups(cost, "actualByMonth");
  const netPlanned = revenuePlanned.map((v, i) => r2(v - costPlanned[i]));
  const netActual = revenueActual.map((v, i) => r2(v - costActual[i]));
  const total = (a: number[]) => r2(a.reduce((s, n) => s + n, 0));

  const unallocated = actuals
    .filter((a) => !input.allocatedActualIds.has(a.id))
    .map((a) => ({
      id: a.id,
      description: a.description,
      amount: r2(Number(a.amount_net || 0)),
      incurred_on: a.incurred_on,
      categoryId: a.category_id,
      vendorName: a.vendor_id ? input.vendorNames.get(a.vendor_id) ?? null : null,
    }))
    .sort((a, b) => b.incurred_on.localeCompare(a.incurred_on));

  return {
    entity, plan, year, revenue, cost,
    pnlPlanned, pnlActual, openingBalance,
    excluded: (() => {
      const off = [...rowsByKey.values()].filter((r) => !r.included);
      return { rows: off.length, amount: r2(off.reduce((s2, r) => s2 + r.plannedTotal, 0)) };
    })(),
    totals: {
      revenuePlanned, revenueActual, costPlanned, costActual, netPlanned, netActual,
      revenuePlannedTotal: total(revenuePlanned), revenueActualTotal: total(revenueActual),
      costPlannedTotal: total(costPlanned), costActualTotal: total(costActual),
      netPlannedTotal: total(netPlanned), netActualTotal: total(netActual),
    },
    unallocated,
  };
}
