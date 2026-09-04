/**
 * Periods, filters and sorting. Pure arithmetic, so no database.
 * Run: npx tsx --tsconfig tsconfig.json scripts/smoke-period.mts
 */
import { clipPnl, clipGroup, rowTotals, monthsIn, normalise, periodLabel, FULL_YEAR, QUARTERS } from "@/lib/finance/period";
import { applyToGroup, matches, sortRows, NO_FILTER, isFiltering, type RowFilter } from "@/lib/finance/rows";
import type { Pnl, PnlLine, BoardGroup, BoardRow } from "@/lib/finance/board";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${got !== undefined ? `  got: ${JSON.stringify(got)}` : ""}`); fail++; }
};

const line = (v: number[]): PnlLine => ({ byMonth: v, total: v.reduce((a, b) => a + b, 0) });
const twelve = (n: number) => Array.from({ length: 12 }, () => n);

const pnl: Pnl = {
  revenue: line(twelve(100)), cogs: line(twelve(40)), grossProfit: line(twelve(60)),
  opex: line(twelve(10)), development: line(twelve(5)), totalCosts: line(twelve(55)),
  result: line(twelve(45)), inventory: line(twelve(0)), financing: line(twelve(0)),
  costOfSales: line(twelve(0)), closingStock: line(twelve(0)),
  cashMovement: line(twelve(45)),
  accumulated: Array.from({ length: 12 }, (_, i) => 1000 + 45 * (i + 1)),
  lowestPoint: 1045, grossMarginPct: 60, netMarginPct: 45, marginMeaningful: true,
};

console.log("\nPeriods\n");
check("a full year is twelve months", monthsIn(FULL_YEAR).length === 12);
check("Q2 is April to June", JSON.stringify(monthsIn(QUARTERS[1].period)) === "[4,5,6]");
check("an inverted range reads as a range, not as nothing",
      JSON.stringify(normalise({ from: 9, to: 3 })) === '{"from":3,"to":9}');
check("out of range is clamped, not rejected",
      JSON.stringify(normalise({ from: -4, to: 99 })) === '{"from":1,"to":12}');
check("the full year is named by its year", periodLabel(FULL_YEAR, 2027) === "2027");
check("a quarter is named as one", periodLabel({ from: 4, to: 6 }, 2027) === "Q2 2027");
check("one month is named as one", periodLabel({ from: 9, to: 9 }, 2027) === "Sep 2027");
check("anything else spells out its ends", periodLabel({ from: 9, to: 12 }, 2027) === "Sep–Dec 2027", periodLabel({ from: 9, to: 12 }, 2027));

console.log("\nClipping a P&L\n");
const q2 = clipPnl(pnl, { from: 4, to: 6 });
check("a quarter sums only its own months", q2.revenue.total === 300, q2.revenue.total);
check("costs are clipped the same way", q2.totalCosts.total === 165, q2.totalCosts.total);
check("the window has as many columns as months", q2.revenue.byMonth.length === 3);
check("the running balance still counts from January", q2.accumulated[0] === 1000 + 45 * 4, q2.accumulated[0]);
check("the low point is the lowest inside the window", q2.lowestPoint === 1180, q2.lowestPoint);
check("margins are recomputed, not inherited", q2.grossMarginPct === 60);
check("a full year is returned untouched", clipPnl(pnl, FULL_YEAR) === pnl);

// Stock going up with nothing sold against it: no cost of sale, so no margin.
const stocky: Pnl = { ...pnl, revenue: line(twelve(0)), cogs: line(twelve(0)),
                      inventory: line(twelve(500)), closingStock: line(twelve(500)) };
check("a window with no sales withholds the margin",
      clipPnl(stocky, { from: 1, to: 3 }).grossMarginPct === null);
// The same stock, now sold: the margin is real and the cost is in it.
const sold: Pnl = { ...pnl, cogs: line(twelve(0)), inventory: line(twelve(40)),
                    costOfSales: line(twelve(40)), closingStock: line(twelve(0)),
                    grossProfit: line(twelve(60)) };
const soldQ1 = clipPnl(sold, { from: 1, to: 3 });
check("cost of sales is clipped like every other line", soldQ1.costOfSales.total === 120, soldQ1.costOfSales.total);
check("...and it makes the margin meaningful again", soldQ1.grossMarginPct === 60, soldQ1.grossMarginPct);

console.log("\nRows\n");
const mk = (key: string, label: string, planned: number[], actual: number[] = twelve(0),
            over: Partial<BoardRow> = {}): BoardRow => ({
  key, categoryId: "c", label, editionId: null, editionLabel: null, vendorId: null, vendorName: null,
  confidence: "expected", included: true,
  cells: planned.map((p, i) => ({ month: i + 1, lineId: null, planned: p, actual: actual[i] })),
  plannedTotal: planned.reduce((a, b) => a + b, 0), actualTotal: actual.reduce((a, b) => a + b, 0),
  ...over,
});

const rows: BoardRow[] = [
  mk("a", "Boards, landed cost", twelve(1000)),
  mk("b", "Slalom mould", [0, 0, 5000, ...twelve(0).slice(3)], twelve(0), { confidence: "committed" }),
  mk("c", "Website and hosting", twelve(20), twelve(30)),
  mk("d", "Old idea", twelve(900), twelve(0), { included: false }),
  mk("e", "Freight", twelve(200), twelve(50), { vendorName: "Kuehne" }),
];

check("a totals window respects the period", rowTotals(rows[0], { from: 1, to: 3 }).planned === 3000);
check("every word must match", matches(rows[1], { ...NO_FILTER, q: "slalom mould" }, FULL_YEAR));
check("...so an unrelated pair matches nothing", !matches(rows[1], { ...NO_FILTER, q: "slalom website" }, FULL_YEAR));
check("the vendor is searchable too", matches(rows[4], { ...NO_FILTER, q: "kuehne" }, FULL_YEAR));
check("confidence filters", matches(rows[1], { ...NO_FILTER, confidence: ["committed"] }, FULL_YEAR)
      && !matches(rows[0], { ...NO_FILTER, confidence: ["committed"] }, FULL_YEAR));
check("excluded rows can be hidden", !matches(rows[3], { ...NO_FILTER, excluded: "hide" }, FULL_YEAR));
check("...or looked at on their own", matches(rows[3], { ...NO_FILTER, excluded: "only" }, FULL_YEAR)
      && !matches(rows[0], { ...NO_FILTER, excluded: "only" }, FULL_YEAR));
check("only rows with something booked", matches(rows[2], { ...NO_FILTER, withActuals: true }, FULL_YEAR)
      && !matches(rows[0], { ...NO_FILTER, withActuals: true }, FULL_YEAR));
check("overspending is findable", matches(rows[2], { ...NO_FILTER, variance: "over" }, FULL_YEAR)
      && !matches(rows[4], { ...NO_FILTER, variance: "over" }, FULL_YEAR));
check("underspending means booked and short, not merely unbooked",
      matches(rows[4], { ...NO_FILTER, variance: "under" }, FULL_YEAR)
      && !matches(rows[0], { ...NO_FILTER, variance: "under" }, FULL_YEAR));
check("a period changes what counts as a variance",
      !matches(rows[1], { ...NO_FILTER, withActuals: true }, { from: 1, to: 2 }));
check("no filter is not filtering", !isFiltering(NO_FILTER) && isFiltering({ ...NO_FILTER, q: "x" }));

console.log("\nSorting\n");
check("biggest first", sortRows(rows, "amount-desc", FULL_YEAR)[0].key === "a", sortRows(rows, "amount-desc", FULL_YEAR).map((r) => r.key));
check("a period changes the order", sortRows(rows, "amount-desc", { from: 3, to: 3 })[0].key === "b");
check("most actually spent", sortRows(rows, "actual-desc", FULL_YEAR)[0].key === "e");
check("nothing booked is not a big variance", sortRows(rows, "variance-desc", FULL_YEAR).at(-1)!.key !== "c");
check("A to Z", sortRows(rows, "name", FULL_YEAR)[0].label === "Boards, landed cost");
check("as planned leaves the order alone", sortRows(rows, "plan", FULL_YEAR)[0].key === "a");
check("sorting never loses a row", sortRows(rows, "amount-desc", FULL_YEAR).length === rows.length);

console.log("\nGroups\n");
const group: BoardGroup = {
  category: null, rows,
  plannedByMonth: twelve(0), actualByMonth: twelve(0), plannedTotal: 0, actualTotal: 0,
};
const filtered = applyToGroup(group, { ...NO_FILTER, q: "boards" }, "plan", FULL_YEAR);
check("filtering says what it hid", filtered.hidden === 4, filtered.hidden);
check("the subtotal matches the rows still printed", filtered.group.plannedTotal === 12000, filtered.group.plannedTotal);
// Sorting forces the recompute; with nothing to do the group is passed straight
// back, which the next check covers.
const withExcluded = applyToGroup(group, NO_FILTER, "amount-desc", FULL_YEAR);
check("an excluded row is shown but adds nothing to the subtotal",
      withExcluded.group.rows.length === 5 && withExcluded.group.plannedTotal === 12000 + 5000 + 240 + 2400,
      withExcluded.group.plannedTotal);
check("...and the row itself is still there to switch back on",
      withExcluded.group.rows.some((r) => r.key === "d" && !r.included));
const untouched = applyToGroup(group, NO_FILTER, "plan", FULL_YEAR);
check("nothing to do returns the same object", untouched.group === group);
const clipped = clipGroup({ ...group, plannedByMonth: twelve(100) }, { from: 1, to: 3 });
check("a clipped group totals its window", clipped.plannedTotal === 300, clipped.plannedTotal);

console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
