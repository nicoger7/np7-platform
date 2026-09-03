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
};

export type BoardEntity = {
  id: string;
  key: string;
  name: string;
  role: string;
  division: string | null;
  status: string;
  active_from: string | null;
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
  confidence: string | null;
};
type RawAlloc = { plan_line_id: string; amount: number | string | null };
type RawActual = {
  id: string; description: string; amount_net: number | string | null;
  incurred_on: string; category_id: string | null; vendor_id: string | null;
};

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
        cells: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, lineId: null, planned: 0, actual: 0 })),
        plannedTotal: 0,
        actualTotal: 0,
      };
      rowsByKey.set(key, row);
    }
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
    totals: {
      revenuePlanned, revenueActual, costPlanned, costActual, netPlanned, netActual,
      revenuePlannedTotal: total(revenuePlanned), revenueActualTotal: total(revenueActual),
      costPlannedTotal: total(costPlanned), costActualTotal: total(costActual),
      netPlannedTotal: total(netPlanned), netActualTotal: total(netActual),
    },
    unallocated,
  };
}
