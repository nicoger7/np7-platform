import { r2, type BoardGroup, type BoardRow } from "./board";
import { rowTotals, type Period } from "./period";

/**
 * Finding one row among three hundred.
 *
 * The budget grid is the only screen in the admin where the answer is often a
 * single line and the list is long enough to hide it. Everything here is
 * client-side on rows that are already loaded, so a filter is instant and a
 * cleared filter costs nothing.
 *
 * Filtering hides rows. It does NOT change what they add up to anywhere else:
 * the P&L, the cash line and the charts keep answering for the whole plan,
 * because a search box is a way of looking and not a way of deciding. Excluding
 * a row with its switch is the opposite, and that one does change the totals.
 */

export type RowFilter = {
  /** Matches the label, the vendor and the edition. */
  q: string;
  /** committed | expected | possible. Empty means all of them. */
  confidence: string[];
  /** Rows switched off are usually noise, but sometimes they are the question. */
  excluded: "hide" | "show" | "only";
  /** Only rows where something has actually been booked. */
  withActuals: boolean;
  /** Only rows that are over or under what was planned. */
  variance: "any" | "over" | "under";
};

export const NO_FILTER: RowFilter = {
  q: "", confidence: [], excluded: "show", withActuals: false, variance: "any",
};

export const isFiltering = (f: RowFilter) =>
  f.q.trim() !== "" || f.confidence.length > 0 || f.excluded !== "show" ||
  f.withActuals || f.variance !== "any";

export type RowSort =
  | "plan"          // the order the plan was written in
  | "amount-desc" | "amount-asc"
  | "actual-desc"
  | "name" | "name-desc"
  | "variance-desc";

export const SORTS: { key: RowSort; label: string }[] = [
  { key: "plan",          label: "As planned" },
  { key: "amount-desc",   label: "Biggest first" },
  { key: "amount-asc",    label: "Smallest first" },
  { key: "actual-desc",   label: "Most actually spent" },
  { key: "variance-desc", label: "Furthest from plan" },
  { key: "name",          label: "A to Z" },
  { key: "name-desc",     label: "Z to A" },
];

const haystack = (r: BoardRow) =>
  [r.label, r.vendorName ?? "", r.editionLabel ?? ""].join(" ").toLowerCase();

export function matches(row: BoardRow, f: RowFilter, period: Period): boolean {
  const q = f.q.trim().toLowerCase();
  // Every word must appear somewhere, so "slalom mould" finds the one row that
  // is about both rather than every row about either.
  if (q && !q.split(/\s+/).every((w) => haystack(row).includes(w))) return false;

  if (f.confidence.length && !f.confidence.includes(row.confidence)) return false;
  if (f.excluded === "hide" && !row.included) return false;
  if (f.excluded === "only" && row.included) return false;

  const { planned, actual } = rowTotals(row, period);
  if (f.withActuals && actual === 0) return false;
  if (f.variance === "over" && !(actual > planned)) return false;
  if (f.variance === "under" && !(actual > 0 && actual < planned)) return false;
  return true;
}

export function sortRows(rows: BoardRow[], sort: RowSort, period: Period): BoardRow[] {
  if (sort === "plan") return rows;
  const t = new Map(rows.map((r) => [r.key, rowTotals(r, period)]));
  const size = (r: BoardRow) => Math.abs(t.get(r.key)!.planned);
  const copy = [...rows];
  switch (sort) {
    case "amount-desc":   copy.sort((a, b) => size(b) - size(a)); break;
    case "amount-asc":    copy.sort((a, b) => size(a) - size(b)); break;
    case "actual-desc":   copy.sort((a, b) => Math.abs(t.get(b.key)!.actual) - Math.abs(t.get(a.key)!.actual)); break;
    // Nothing booked yet is not a variance, it is an absence, so those sink to
    // the bottom rather than topping a list of things that look wildly off plan.
    case "variance-desc": copy.sort((a, b) => {
      const v = (r: BoardRow) => { const x = t.get(r.key)!; return x.actual === 0 ? -1 : Math.abs(x.actual - x.planned); };
      return v(b) - v(a);
    }); break;
    case "name":          copy.sort((a, b) => a.label.localeCompare(b.label)); break;
    case "name-desc":     copy.sort((a, b) => b.label.localeCompare(a.label)); break;
  }
  return copy;
}

/**
 * Filter and sort a group, and say what was hidden.
 *
 * The group's totals are recomputed over the rows that survived, so the
 * subtotal always adds up to the rows printed under it. A subtotal that
 * silently included rows you had filtered away would be worse than no subtotal.
 */
export function applyToGroup(
  group: BoardGroup, f: RowFilter, sort: RowSort, period: Period,
): { group: BoardGroup; hidden: number } {
  const kept = group.rows.filter((r) => matches(r, f, period));
  const hidden = group.rows.length - kept.length;
  if (!hidden && sort === "plan") return { group, hidden: 0 };

  const plannedByMonth = Array.from({ length: 12 }, () => 0);
  const actualByMonth = Array.from({ length: 12 }, () => 0);
  for (const r of kept) {
    if (!r.included) continue;
    for (let i = 0; i < 12; i++) {
      plannedByMonth[i] = r2(plannedByMonth[i] + (r.cells[i]?.planned ?? 0));
      actualByMonth[i] = r2(actualByMonth[i] + (r.cells[i]?.actual ?? 0));
    }
  }
  return {
    group: {
      ...group,
      rows: sortRows(kept, sort, period),
      plannedByMonth, actualByMonth,
      plannedTotal: r2(plannedByMonth.reduce((a, b) => a + b, 0)),
      actualTotal: r2(actualByMonth.reduce((a, b) => a + b, 0)),
    },
    hidden,
  };
}
