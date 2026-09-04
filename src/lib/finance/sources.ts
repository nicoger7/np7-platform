import { r2 } from "./board";

/**
 * Where the numbers come from.
 *
 * A budget line is a decision: someone thinks the boards will cost €289,000 and
 * writes it down. Nothing can derive that, because nothing else knows it yet.
 *
 * Everything after the decision is a record, and records already have owners.
 * What the factory is owed lives in the purchase order. What a trip actually
 * cost lives in exp_costs. Copying either of those into a budget row would make
 * a second copy that starts drifting the moment someone edits one of them.
 *
 * So nothing is copied. A plan line NAMES its sources (fin_source_links) and
 * these functions read them when the board is built. Change the purchase order
 * and the budget changes, because the budget was never holding its own answer.
 *
 * Three columns come out of that, and they are the standard ones:
 *
 *   planned    what we decided       authored, only here
 *   committed  what we have promised  derived: ordered, not yet delivered
 *   actual     what has happened      derived: delivered or invoiced
 *
 * COMMITTED AND ACTUAL NEVER OVERLAP. A source contributes to one or the other,
 * never both, because otherwise the total counts the same money twice. That is
 * the single rule this file exists to enforce, and every branch below respects
 * it: as a commitment becomes real it moves across, it does not appear twice.
 */

export type SourceTable =
  | "exp_costs" | "exp_payments"
  | "hw_po_lines" | "hw_po_payments" | "hw_receipts" | "hw_shipment_costs"
  | "hw_orders" | "documents";

export type PnlGroup = "revenue" | "cogs" | "inventory" | "opex" | "development" | "financing";

/** One fact, read from the system that owns it. */
export type SourceFact = {
  table: SourceTable;
  id: string;
  /** What it is, in the words of the system it came from. */
  label: string;
  /** Where to go to change it. Null when nothing in the admin owns it yet. */
  href: string | null;
  /** 1..12. Null when the record carries no usable date, which is a fact worth showing. */
  month: number | null;
  /**
   * The day it actually happened, as an ISO date.
   *
   * The plan is monthly and can only ever be monthly, but what happened has a
   * date, and that date is the difference between "April" and "the container
   * cleared customs on the 19th". Null where nobody recorded one, which is a
   * real state and is shown as such rather than being rounded to the 1st.
   */
  on: string | null;
  group: PnlGroup;
  committed: number;
  actual: number;
  vendorId: string | null;
  editionId: string | null;
  /** Accrual = when it was incurred. Cash = when the money moved. Mixing the two
   *  silently is how a forecast ends up wrong, so each fact says which it is. */
  basis: "accrual" | "cash";
};

/** The date part, when there is one. Timestamps keep their day, not their hour. */
const dayOfIso = (iso: string | null | undefined): string | null =>
  iso ? String(iso).slice(0, 10) : null;

const monthOfIso = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const m = Number(String(iso).slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
};

const yearOfIso = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const y = Number(String(iso).slice(0, 4));
  return Number.isFinite(y) ? y : null;
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ── Experience ───────────────────────────────────────────────────────────────

export type RawExpCost = {
  id: string; item: string | null; estimated_amount: number | string | null;
  actual_amount: number | string | null; status: string | null;
  date: string | null; edition_id: string | null;
};

/**
 * A trip cost. Estimated until it is invoiced, then actual.
 *
 * The date is the cost's own if it has one and the edition's start if it does
 * not, because a cost belonging to a trip in March is a March cost even when
 * nobody typed a date on it.
 *
 * A cost with neither belongs to no year, so it cannot honestly appear on a
 * year's board and is left out. Left out is not the same as forgotten:
 * `undatedExpCosts` counts exactly those rows so the page can say how much
 * money is sitting outside every budget instead of letting it evaporate.
 */
export function factsFromExpCosts(
  costs: RawExpCost[],
  editionStart: Map<string, string>,
  year: number,
): SourceFact[] {
  const out: SourceFact[] = [];
  for (const c of costs) {
    const when = c.date ?? (c.edition_id ? editionStart.get(c.edition_id) ?? null : null);
    if (yearOfIso(when) !== year) continue;

    const estimated = num(c.estimated_amount);
    const actual = num(c.actual_amount);
    // Once it is invoiced the estimate is history. Keeping both would count the
    // same trip cost twice in one column pair.
    const committed = actual > 0 ? 0 : estimated;
    if (committed === 0 && actual === 0) continue;

    out.push({
      table: "exp_costs",
      id: c.id,
      label: c.item ?? "Trip cost",
      href: "/admin/exp-costs",
      month: monthOfIso(when), on: dayOfIso(when),
      group: "cogs",
      committed: r2(committed),
      actual: r2(actual),
      vendorId: null,
      editionId: c.edition_id,
      basis: "accrual",
    });
  }
  return out;
}

/** Costs that can never reach a budget, because nothing says when they happened.
 *  Reported rather than dropped: this number should be zero, and if it is not,
 *  someone needs to know how much is missing. */
export function undatedExpCosts(
  costs: RawExpCost[],
  editionStart: Map<string, string>,
): { count: number; amount: number } {
  let count = 0, amount = 0;
  for (const c of costs) {
    const when = c.date ?? (c.edition_id ? editionStart.get(c.edition_id) ?? null : null);
    if (when) continue;
    const value = num(c.actual_amount) || num(c.estimated_amount);
    if (value === 0) continue;
    count += 1; amount = r2(amount + value);
  }
  return { count, amount };
}

export type RawExpPayment = {
  id: string; amount: number | string | null; date: string | null;
  received_at: string | null; direction: string | null; status: string | null;
  vendor_id: string | null; experience_id: string | null;
};

/**
 * Money that actually moved on a booking. Revenue only.
 *
 * The cost-direction payments are deliberately left out: exp_costs already
 * carries those on an accrual basis, and a payment to the same hotel would be
 * the same money a second time.
 */
export function factsFromExpPayments(payments: RawExpPayment[], year: number): SourceFact[] {
  const out: SourceFact[] = [];
  for (const p of payments) {
    if ((p.direction ?? "revenue") !== "revenue") continue;
    const when = p.date ?? p.received_at;
    if (yearOfIso(when) !== year) continue;
    const amount = num(p.amount);
    if (amount === 0) continue;
    out.push({
      table: "exp_payments",
      id: p.id,
      label: "Booking payment",
      href: "/admin/payments",
      month: monthOfIso(when), on: dayOfIso(when),
      group: "revenue",
      committed: 0,
      actual: r2(amount),
      vendorId: p.vendor_id,
      editionId: null,
      basis: "cash",
    });
  }
  return out;
}

// ── Performance ──────────────────────────────────────────────────────────────

export type RawPoLine = {
  id: string; po_id: string; qty_ordered: number | null; unit_cost: number | string | null;
  qty_received: number | null; qty_rejected: number | null;
};
export type RawPo = {
  id: string; po_number: string | null; status: string | null;
  expected_receipt_date: string | null; order_date: string | null; supplier_id: string | null;
};

/** A cancelled order owes nobody anything. */
const PO_DEAD = new Set(["cancelled", "canceled", "draft", "rejected"]);

/**
 * Stock on order.
 *
 * Committed is what is ordered and not yet in the building, valued at the
 * agreed unit cost and dated to when it is expected. What has arrived is not
 * here: hw_receipts owns that, at landed cost rather than at the price on the
 * order, which is the number that is actually true.
 */
export function factsFromPoLines(lines: RawPoLine[], pos: Map<string, RawPo>, year: number): SourceFact[] {
  const out: SourceFact[] = [];
  for (const l of lines) {
    const po = pos.get(l.po_id);
    if (!po || PO_DEAD.has((po.status ?? "").toLowerCase())) continue;
    const when = po.expected_receipt_date ?? po.order_date;
    if (yearOfIso(when) !== year) continue;

    const outstanding = Math.max(0, num(l.qty_ordered) - num(l.qty_received) - num(l.qty_rejected));
    if (outstanding === 0) continue;
    const committed = r2(outstanding * num(l.unit_cost));
    if (committed === 0) continue;

    out.push({
      table: "hw_po_lines",
      id: l.id,
      label: `${po.po_number ?? "Purchase order"} · ${outstanding} on order`,
      href: "/admin/inventory",
      month: monthOfIso(when), on: dayOfIso(when),
      group: "inventory",
      committed,
      actual: 0,
      vendorId: po.supplier_id,
      editionId: null,
      basis: "accrual",
    });
  }
  return out;
}

export type RawReceipt = {
  id: string; po_line_id: string; qty: number | null;
  unit_landed_cost: number | string | null; received_at: string | null;
};

/** Stock that arrived, at what it really cost to get it here. */
export function factsFromReceipts(receipts: RawReceipt[], year: number): SourceFact[] {
  const out: SourceFact[] = [];
  for (const rec of receipts) {
    if (yearOfIso(rec.received_at) !== year) continue;
    const actual = r2(num(rec.qty) * num(rec.unit_landed_cost));
    if (actual === 0) continue;
    out.push({
      table: "hw_receipts",
      id: rec.id,
      label: `${num(rec.qty)} received`,
      href: "/admin/inventory",
      month: monthOfIso(rec.received_at), on: dayOfIso(rec.received_at),
      group: "inventory",
      committed: 0,
      actual,
      vendorId: null,
      editionId: null,
      basis: "accrual",
    });
  }
  return out;
}

export type RawShipmentCost = {
  id: string; shipment_id: string; kind: string | null; amount: number | string | null;
  currency: string | null; fx_rate: number | string | null; is_estimate: boolean | null;
};

/**
 * Freight, duty, brokerage.
 *
 * is_estimate is the whole distinction: a quoted freight rate is a commitment,
 * the forwarder's invoice is an actual. The shipment's own date decides the
 * month, because a duty bill belongs to the container that incurred it.
 */
export function factsFromShipmentCosts(
  costs: RawShipmentCost[],
  shipmentDate: Map<string, string | null>,
  year: number,
): SourceFact[] {
  const out: SourceFact[] = [];
  for (const c of costs) {
    const when = shipmentDate.get(c.shipment_id) ?? null;
    if (yearOfIso(when) !== year) continue;
    // Already stored in EUR; the rate is kept for the audit, not to convert again.
    const amount = r2(num(c.amount));
    if (amount === 0) continue;
    const estimate = c.is_estimate !== false;
    out.push({
      table: "hw_shipment_costs",
      id: c.id,
      label: `${c.kind ?? "Shipping"}${estimate ? " (quoted)" : ""}`,
      href: "/admin/inventory",
      month: monthOfIso(when), on: dayOfIso(when),
      group: "inventory",
      committed: estimate ? amount : 0,
      actual: estimate ? 0 : amount,
      vendorId: null,
      editionId: null,
      basis: "accrual",
    });
  }
  return out;
}

export type RawHwOrder = {
  id: string; order_number: string | null; status: string | null;
  total_net: number | string | null; total: number | string | null;
  placed_at: string | null; created_at: string | null;
};

const ORDER_DEAD = new Set(["cancelled", "canceled", "draft", "refunded", "failed"]);

/** A shop order. Paid is actual, placed-but-unpaid is a commitment from a customer. */
export function factsFromHwOrders(orders: RawHwOrder[], year: number): SourceFact[] {
  const out: SourceFact[] = [];
  for (const o of orders) {
    const status = (o.status ?? "").toLowerCase();
    if (ORDER_DEAD.has(status)) continue;
    const when = o.placed_at ?? o.created_at;
    if (yearOfIso(when) !== year) continue;
    const amount = r2(num(o.total_net ?? o.total));
    if (amount === 0) continue;
    const settled = status === "paid" || status === "fulfilled" || status === "shipped" || status === "delivered";
    out.push({
      table: "hw_orders",
      id: o.id,
      label: o.order_number ?? "Order",
      href: "/admin/orders",
      month: monthOfIso(when), on: dayOfIso(when),
      group: "revenue",
      committed: settled ? 0 : amount,
      actual: settled ? amount : 0,
      vendorId: null,
      editionId: null,
      basis: settled ? "cash" : "accrual",
    });
  }
  return out;
}

// ── The cash schedule, which is a different question ─────────────────────────

export type RawPoPayment = {
  id: string; po_id: string; kind: string | null;
  planned_amount: number | string | null; planned_date: string | null;
  paid_amount: number | string | null; paid_date: string | null;
};

export type CashCommitment = {
  id: string; label: string; month: number | null;
  /** The day the money moved, or is due to. */
  on: string | null;
  planned: number; paid: number; href: string | null;
};

/**
 * When supplier money actually leaves.
 *
 * Deliberately NOT a board row. A deposit is not a cost, it is the same cost
 * paid earlier, and putting it in the P&L next to the stock it pays for would
 * count the boards twice. It belongs to the cash line, which is the only place
 * the timing of a 30/70 payment term changes the answer, and it is also the
 * place where it changes it enormously.
 */
export function cashCommitments(payments: RawPoPayment[], pos: Map<string, RawPo>, year: number): CashCommitment[] {
  const out: CashCommitment[] = [];
  for (const p of payments) {
    const po = pos.get(p.po_id);
    if (po && PO_DEAD.has((po.status ?? "").toLowerCase())) continue;
    const paid = num(p.paid_amount);
    const when = paid > 0 ? (p.paid_date ?? p.planned_date) : p.planned_date;
    if (yearOfIso(when) !== year) continue;
    const planned = num(p.planned_amount);
    if (planned === 0 && paid === 0) continue;
    out.push({
      id: p.id,
      label: `${po?.po_number ?? "Purchase order"} · ${p.kind ?? "payment"}`,
      month: monthOfIso(when), on: dayOfIso(when),
      // Once paid, the planned figure is history: the paid amount is the truth.
      planned: paid > 0 ? 0 : r2(planned),
      paid: r2(paid),
      href: "/admin/inventory",
    });
  }
  return out;
}

// ── Attaching facts to the lines that predicted them ─────────────────────────

export type SourceLink = {
  plan_line_id: string; source_table: string; source_id: string; share: number | string | null;
};

export type DerivedTotals = {
  /** Per plan line, the committed and actual its named sources add up to. */
  byLine: Map<string, { committed: number[]; actual: number[] }>;
  /** Facts nobody predicted. Real money with no budget line, which is the
   *  interesting half: these are the surprises. */
  unclaimed: SourceFact[];
};

const empty12 = () => Array.from({ length: 12 }, () => 0);

/**
 * Split the facts into the ones a plan line claimed and the ones nobody did.
 *
 * A fact with no month cannot be put in a column, so it is reported as
 * unclaimed rather than guessed at. Being visibly undated is useful; being
 * silently filed under January is not.
 */
export function attachFacts(facts: SourceFact[], links: SourceLink[]): DerivedTotals {
  const claim = new Map<string, { lineId: string; share: number }[]>();
  for (const l of links) {
    const key = `${l.source_table}:${l.source_id}`;
    const share = Math.min(100, Math.max(0, Number(l.share ?? 100) || 0)) / 100;
    if (share === 0) continue;
    if (!claim.has(key)) claim.set(key, []);
    claim.get(key)!.push({ lineId: l.plan_line_id, share });
  }

  const byLine: DerivedTotals["byLine"] = new Map();
  const unclaimed: SourceFact[] = [];

  for (const f of facts) {
    const claims = claim.get(`${f.table}:${f.id}`);
    if (!claims || f.month === null) { unclaimed.push(f); continue; }
    for (const c of claims) {
      let acc = byLine.get(c.lineId);
      if (!acc) { acc = { committed: empty12(), actual: empty12() }; byLine.set(c.lineId, acc); }
      acc.committed[f.month - 1] = r2(acc.committed[f.month - 1] + f.committed * c.share);
      acc.actual[f.month - 1] = r2(acc.actual[f.month - 1] + f.actual * c.share);
    }
    // A source claimed at less than its full value leaves the rest unaccounted
    // for, and that remainder is exactly the kind of thing that goes missing.
    const claimed = claims.reduce((s, c) => s + c.share, 0);
    if (claimed < 0.9999) {
      const rest = 1 - claimed;
      unclaimed.push({ ...f, committed: r2(f.committed * rest), actual: r2(f.actual * rest) });
    }
  }
  return { byLine, unclaimed };
}

/** Group facts into one derived row per source table and P&L group, so the
 *  board gains a handful of honest rows rather than four hundred. */
export function summariseUnclaimed(facts: SourceFact[]): {
  table: SourceTable; group: PnlGroup; count: number;
  committed: number[]; actual: number[]; committedTotal: number; actualTotal: number;
  undatedCommitted: number; undatedActual: number; href: string | null;
}[] {
  const buckets = new Map<string, ReturnType<typeof summariseUnclaimed>[number]>();
  for (const f of facts) {
    const key = `${f.table}|${f.group}`;
    let b = buckets.get(key);
    if (!b) {
      b = { table: f.table, group: f.group, count: 0, committed: empty12(), actual: empty12(),
            committedTotal: 0, actualTotal: 0, undatedCommitted: 0, undatedActual: 0, href: f.href };
      buckets.set(key, b);
    }
    b.count += 1;
    if (f.month === null) {
      b.undatedCommitted = r2(b.undatedCommitted + f.committed);
      b.undatedActual = r2(b.undatedActual + f.actual);
    } else {
      b.committed[f.month - 1] = r2(b.committed[f.month - 1] + f.committed);
      b.actual[f.month - 1] = r2(b.actual[f.month - 1] + f.actual);
    }
    b.committedTotal = r2(b.committedTotal + f.committed);
    b.actualTotal = r2(b.actualTotal + f.actual);
  }
  return [...buckets.values()].sort((a, b) => b.actualTotal + b.committedTotal - (a.actualTotal + a.committedTotal));
}
