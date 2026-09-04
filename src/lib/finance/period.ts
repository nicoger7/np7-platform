import { MONTHS, r2, type Pnl, type PnlLine, type BoardGroup, type BoardRow } from "./board";

/**
 * Looking at part of a year.
 *
 * A budget is built and stored by month, so every narrower question, a quarter,
 * a single month, "September to May", is the same question asked of a window.
 * Nothing here refetches: the year is already loaded, and clipping it is
 * arithmetic.
 *
 * Two things are deliberately NOT re-derived inside a window. The running cash
 * balance keeps counting from January, because the money in the account at the
 * end of June includes what happened in March whether or not you are looking at
 * March. And the opening figure of a window is the closing figure of the month
 * before it, for the same reason. A quarter that pretended to start from zero
 * would be a different and much less useful number.
 */

export type Period = { from: number; to: number };   // 1..12, inclusive

export const FULL_YEAR: Period = { from: 1, to: 12 };

export const QUARTERS: { key: string; label: string; period: Period }[] = [
  { key: "q1", label: "Q1", period: { from: 1, to: 3 } },
  { key: "q2", label: "Q2", period: { from: 4, to: 6 } },
  { key: "q3", label: "Q3", period: { from: 7, to: 9 } },
  { key: "q4", label: "Q4", period: { from: 10, to: 12 } },
];

export const isFullYear = (p: Period) => p.from === 1 && p.to === 12;

/** Clamped, and never inverted: dragging the end before the start reads as a
 *  single month rather than as an empty period. */
export function normalise(p: Period): Period {
  const from = Math.min(12, Math.max(1, Math.round(p.from)));
  const to = Math.min(12, Math.max(1, Math.round(p.to)));
  return from <= to ? { from, to } : { from: to, to: from };
}

export function monthsIn(p: Period): number[] {
  const { from, to } = normalise(p);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export function periodLabel(p: Period, year: number): string {
  const { from, to } = normalise(p);
  if (from === 1 && to === 12) return String(year);
  const q = QUARTERS.find((x) => x.period.from === from && x.period.to === to);
  if (q) return `${q.label} ${year}`;
  if (from === to) return `${MONTHS[from - 1]} ${year}`;
  return `${MONTHS[from - 1]}–${MONTHS[to - 1]} ${year}`;
}

const clipLine = (l: PnlLine, months: number[]): PnlLine => {
  const byMonth = months.map((m) => l.byMonth[m - 1] ?? 0);
  return { byMonth, total: r2(byMonth.reduce((a, b) => a + b, 0)) };
};

const pct = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

/**
 * The same P&L, answered for a window.
 *
 * Every line is summed over the window only, so "what did Q2 cost" is the
 * question actually being answered. The running balance is the exception
 * described at the top: those values still count from January, and only the
 * slice of them inside the window is shown.
 */
export function clipPnl(pnl: Pnl, period: Period): Pnl {
  const months = monthsIn(period);
  if (months.length === 12) return pnl;

  const revenue = clipLine(pnl.revenue, months);
  const cogs = clipLine(pnl.cogs, months);
  const grossProfit = clipLine(pnl.grossProfit, months);
  const inventory = clipLine(pnl.inventory, months);
  const costOfSales = clipLine(pnl.costOfSales, months);
  const closingStock = clipLine(pnl.closingStock, months);
  const accumulated = months.map((m) => pnl.accumulated[m - 1] ?? 0);

  // The same test as the full year, applied to the window: a margin means
  // something once the cost of what was sold is in it.
  const marginMeaningful = revenue.total > 0 && (cogs.total + costOfSales.total) > 0;

  return {
    revenue, cogs, grossProfit, inventory, costOfSales, closingStock,
    opex: clipLine(pnl.opex, months),
    development: clipLine(pnl.development, months),
    totalCosts: clipLine(pnl.totalCosts, months),
    result: clipLine(pnl.result, months),
    financing: clipLine(pnl.financing, months),
    cashMovement: clipLine(pnl.cashMovement, months),
    accumulated,
    lowestPoint: accumulated.length ? Math.min(...accumulated) : 0,
    grossMarginPct: marginMeaningful ? pct(grossProfit.total, revenue.total) : null,
    netMarginPct: marginMeaningful ? pct(clipLine(pnl.result, months).total, revenue.total) : null,
    marginMeaningful,
  };
}

/** A row's planned and actual inside the window. */
export function rowTotals(row: BoardRow, period: Period): { planned: number; actual: number } {
  let planned = 0, actual = 0;
  for (const m of monthsIn(period)) {
    const c = row.cells[m - 1];
    if (!c) continue;
    planned = r2(planned + c.planned);
    actual = r2(actual + c.actual);
  }
  return { planned, actual };
}

/** A group's own totals, recomputed for the window. Excluded rows still
 *  contribute nothing, exactly as they do across the full year. */
export function clipGroup(group: BoardGroup, period: Period): BoardGroup {
  const months = monthsIn(period);
  if (months.length === 12) return group;
  const plannedByMonth = months.map((m) => group.plannedByMonth[m - 1] ?? 0);
  const actualByMonth = months.map((m) => group.actualByMonth[m - 1] ?? 0);
  return {
    ...group,
    plannedByMonth, actualByMonth,
    plannedTotal: r2(plannedByMonth.reduce((a, b) => a + b, 0)),
    actualTotal: r2(actualByMonth.reduce((a, b) => a + b, 0)),
  };
}
