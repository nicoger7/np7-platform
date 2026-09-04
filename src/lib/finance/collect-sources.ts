import {
  factsFromExpCosts, factsFromExpPayments, factsFromPoLines, factsFromReceipts,
  factsFromShipmentCosts, factsFromHwOrders, cashCommitments, undatedExpCosts,
  attachFacts, summariseUnclaimed,
  type SourceFact, type CashCommitment, type SourceLink,
} from "./sources";

/**
 * Fetching the facts. The arithmetic lives next door in sources.ts, which is
 * pure and tested; this file only knows which tables to ask and which company
 * is asking.
 *
 * A division that owns none of these tables reads none of them. Experience has
 * no purchase orders and Performance has no bookings, and asking anyway would
 * be both wasted round trips and a way for one company's rows to arrive in the
 * other company's budget by accident.
 */

/**
 * One thing that happened, on the day it happened.
 *
 * The plan is monthly and can only be monthly. What HAPPENED has a date, and
 * these carry it, so a quarter can be drawn as three blocky planned months with
 * the real events scattered across the actual days beneath them.
 *
 * `on` is null where nobody recorded a date. That is left visible rather than
 * rounded to the first of the month, because "we do not know when" and "it
 * happened on the 1st" are different facts and only one of them is true.
 */
export type DatedEvent = {
  id: string; table: string; label: string;
  on: string | null;
  amount: number;
  inflow: boolean;
  group: string;
  href: string | null;
  /** Settled, as against merely promised. */
  settled: boolean;
};

export type CollectedSources = {
  /** Per plan line, twelve months of committed and twelve of actual. */
  byLine: Record<string, { committed: number[]; actual: number[] }>;
  /** Real money that no budget line predicted, grouped so it stays readable. */
  unclaimed: ReturnType<typeof summariseUnclaimed>;
  /** Supplier payments by month. Cash, deliberately not in the P&L. */
  cash: CashCommitment[];
  /** How much is sitting outside every budget because it has no date. */
  stranded: { count: number; amount: number };
  /** Which tables were actually consulted, so the page can say so plainly. */
  consulted: string[];
  /** Everything that happened, dated to the day where a day is known. */
  events: DatedEvent[];
};

const EMPTY: CollectedSources = {
  byLine: {}, unclaimed: [], cash: [], stranded: { count: 0, amount: 0 }, consulted: [], events: [],
};

export async function collectSources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  entity: { id: string; division: string | null } | null,
  year: number,
  planLineIds: string[],
): Promise<CollectedSources> {
  if (!entity) return EMPTY;

  const facts: SourceFact[] = [];
  const cash: CashCommitment[] = [];
  const consulted: string[] = [];
  let stranded = { count: 0, amount: 0 };

  if (entity.division === "experience") {
    const [costsRes, edsRes, paysRes] = await Promise.all([
      db.from("exp_costs").select("id,item,estimated_amount,actual_amount,status,date,edition_id"),
      db.from("exp_editions").select("id,date_start"),
      db.from("exp_payments").select("id,amount,date,received_at,direction,status,vendor_id,experience_id"),
    ]);
    const editionStart = new Map<string, string>(
      ((edsRes.data ?? []) as { id: string; date_start: string | null }[])
        .filter((e) => e.date_start).map((e) => [e.id, e.date_start as string]),
    );
    facts.push(...factsFromExpCosts(costsRes.data ?? [], editionStart, year));
    facts.push(...factsFromExpPayments(paysRes.data ?? [], year));
    stranded = undatedExpCosts(costsRes.data ?? [], editionStart);
    consulted.push("exp_costs", "exp_payments");
  }

  if (entity.division === "hardware") {
    const [posRes, poLinesRes, poPaysRes, receiptsRes, shipRes, shipCostRes, ordersRes] = await Promise.all([
      db.from("hw_purchase_orders").select("id,po_number,status,expected_receipt_date,order_date,supplier_id"),
      db.from("hw_po_lines").select("id,po_id,qty_ordered,unit_cost,qty_received,qty_rejected"),
      db.from("hw_po_payments").select("id,po_id,kind,planned_amount,planned_date,paid_amount,paid_date"),
      db.from("hw_receipts").select("id,po_line_id,qty,unit_landed_cost,received_at"),
      db.from("hw_inbound_shipments").select("id,ata,eta,etd"),
      db.from("hw_shipment_costs").select("id,shipment_id,kind,amount,currency,fx_rate,is_estimate"),
      db.from("hw_orders").select("id,order_number,status,total_net,total,placed_at,created_at"),
    ]);
    const pos = new Map(((posRes.data ?? []) as { id: string }[]).map((p) => [p.id, p]));
    // Arrived beats expected beats departed: the most certain date wins, so a
    // container that has landed stops being forecast in the month it was hoped for.
    const shipDate = new Map<string, string | null>(
      ((shipRes.data ?? []) as { id: string; ata: string | null; eta: string | null; etd: string | null }[])
        .map((s) => [s.id, s.ata ?? s.eta ?? s.etd]),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    facts.push(...factsFromPoLines(poLinesRes.data ?? [], pos as any, year));
    facts.push(...factsFromReceipts(receiptsRes.data ?? [], year));
    facts.push(...factsFromShipmentCosts(shipCostRes.data ?? [], shipDate, year));
    facts.push(...factsFromHwOrders(ordersRes.data ?? [], year));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cash.push(...cashCommitments(poPaysRes.data ?? [], pos as any, year));
    consulted.push("hw_purchase_orders", "hw_po_lines", "hw_receipts", "hw_shipment_costs", "hw_orders");
  }

  let links: SourceLink[] = [];
  if (planLineIds.length) {
    const { data } = await db
      .from("fin_source_links").select("plan_line_id,source_table,source_id,share").in("plan_line_id", planLineIds);
    links = (data ?? []) as SourceLink[];
  }

  const { byLine, unclaimed } = attachFacts(facts, links);

  /* Every fact that carries money becomes an event. Committed and actual both
     appear, distinguished rather than merged, because "the forwarder has quoted
     8.000" and "the forwarder has invoiced 8.000" are different days and
     different degrees of certainty. */
  const events: DatedEvent[] = facts
    .filter((f) => f.committed !== 0 || f.actual !== 0)
    .map((f) => ({
      id: `${f.table}:${f.id}`,
      table: f.table,
      label: f.label,
      on: f.on,
      amount: Math.abs(f.actual || f.committed),
      inflow: f.group === "revenue",
      group: f.group,
      href: f.href,
      settled: f.actual !== 0,
    }))
    .sort((a, b) => (a.on ?? "9999").localeCompare(b.on ?? "9999"));

  // Supplier payments are cash, not P&L, but they are absolutely events.
  for (const c of cash) {
    if (c.paid === 0 && c.planned === 0) continue;
    events.push({
      id: `hw_po_payments:${c.id}`, table: "hw_po_payments", label: c.label,
      on: c.on, amount: c.paid || c.planned, inflow: false, group: "inventory",
      href: c.href, settled: c.paid > 0,
    });
  }

  return {
    byLine: Object.fromEntries(byLine),
    unclaimed: summariseUnclaimed(unclaimed),
    cash,
    stranded,
    consulted,
    events: events.sort((a, b) => (a.on ?? "9999").localeCompare(b.on ?? "9999")),
  };
}
