/**
 * Derived-figures smoke test.
 *
 * The one rule this whole area lives or dies by is that committed and actual
 * never describe the same money. Most of what follows is that rule, poked from
 * every angle, plus a pass over the real database so the arithmetic is checked
 * against data nobody wrote for the test.
 *
 * Run: npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/smoke-sources.mts
 */
import { createClient } from "@supabase/supabase-js";
import {
  factsFromExpCosts, factsFromExpPayments, factsFromPoLines, factsFromReceipts,
  factsFromShipmentCosts, factsFromHwOrders, cashCommitments,
  attachFacts, summariseUnclaimed, undatedExpCosts, type SourceFact,
} from "@/lib/finance/sources";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
) as any;

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, got?: unknown) => {
  if (cond) { console.log(`  ✓ ${name}`); pass++; }
  else { console.log(`  ✗ ${name}${got !== undefined ? `  got: ${JSON.stringify(got)}` : ""}`); fail++; }
};
const sum = (f: SourceFact[], k: "committed" | "actual") => Math.round(f.reduce((s, x) => s + x[k], 0) * 100) / 100;

async function main() {
  console.log("\nExperience costs\n");
  const eds = new Map([["ED", "2027-03-14"]]);
  const costs = factsFromExpCosts([
    { id: "a", item: "Hotel", estimated_amount: 1000, actual_amount: null, status: "confirmed", date: "2027-04-02", edition_id: null },
    { id: "b", item: "Flights", estimated_amount: 800, actual_amount: 950, status: "confirmed", date: "2027-05-02", edition_id: null },
    { id: "c", item: "Van", estimated_amount: 300, actual_amount: null, status: "confirmed", date: null, edition_id: "ED" },
    { id: "d", item: "Next year", estimated_amount: 500, actual_amount: null, status: "confirmed", date: "2028-01-02", edition_id: null },
    { id: "e", item: "Nothing yet", estimated_amount: 0, actual_amount: 0, status: "draft", date: "2027-06-01", edition_id: null },
    { id: "f", item: "Orphan", estimated_amount: 400, actual_amount: null, status: "confirmed", date: null, edition_id: null },
  ], eds, 2027);
  check("only rows in the year, carrying money", costs.length === 3, costs.map((c) => c.id));
  check("an estimate with no invoice is committed", costs.find((c) => c.id === "a")?.committed === 1000);
  check("once invoiced, the estimate stops counting", costs.find((c) => c.id === "b")?.committed === 0);
  check("...and the invoice is the actual", costs.find((c) => c.id === "b")?.actual === 950);
  check("a dateless cost borrows its edition's month", costs.find((c) => c.id === "c")?.month === 3);
  check("a cost with no date and no edition belongs to no year", !costs.some((c) => c.id === "f"));
  check("...but it is counted, not lost", undatedExpCosts([
    { id: "f", item: "Orphan", estimated_amount: 400, actual_amount: null, status: "confirmed", date: null, edition_id: null },
  ], eds).amount === 400);
  check("committed + actual never double-count", sum(costs, "committed") === 1300 && sum(costs, "actual") === 950,
        { c: sum(costs, "committed"), a: sum(costs, "actual") });

  console.log("\nExperience payments\n");
  const pays = factsFromExpPayments([
    { id: "p1", amount: 2500, date: "2027-02-10", received_at: null, direction: "revenue", status: "ok", vendor_id: null, experience_id: null },
    { id: "p2", amount: 900, date: "2027-02-11", received_at: null, direction: "cost", status: "ok", vendor_id: "V", experience_id: null },
    { id: "p3", amount: 700, date: null, received_at: "2027-03-01T10:00:00Z", direction: "revenue", status: "ok", vendor_id: null, experience_id: null },
  ], 2027);
  check("only revenue, so vendor payments cannot double exp_costs", pays.length === 2, pays.map((p) => p.id));
  check("received_at stands in for a missing date", pays.find((p) => p.id === "p3")?.month === 3);
  check("payments are cash basis and say so", pays.every((p) => p.basis === "cash"));

  console.log("\nPurchase orders\n");
  const pos = new Map([
    ["PO1", { id: "PO1", po_number: "PO-1", status: "confirmed", expected_receipt_date: "2027-03-20", order_date: "2027-01-10", supplier_id: "S" }],
    ["PO2", { id: "PO2", po_number: "PO-2", status: "cancelled", expected_receipt_date: "2027-04-20", order_date: "2027-01-10", supplier_id: "S" }],
  ]);
  const poLines = factsFromPoLines([
    { id: "l1", po_id: "PO1", qty_ordered: 100, unit_cost: 650, qty_received: 0, qty_rejected: 0 },
    { id: "l2", po_id: "PO1", qty_ordered: 100, unit_cost: 650, qty_received: 60, qty_rejected: 5 },
    { id: "l3", po_id: "PO1", qty_ordered: 50, unit_cost: 650, qty_received: 50, qty_rejected: 0 },
    { id: "l4", po_id: "PO2", qty_ordered: 200, unit_cost: 650, qty_received: 0, qty_rejected: 0 },
  ], pos as any, 2027);
  check("a cancelled order owes nothing", !poLines.some((l) => l.id === "l4"));
  check("only the undelivered part is a commitment", poLines.find((l) => l.id === "l2")?.committed === 22750, poLines.find((l) => l.id === "l2")?.committed);
  check("a fully received line is no longer committed", !poLines.some((l) => l.id === "l3"));
  check("commitment sits in the month it is expected", poLines.find((l) => l.id === "l1")?.month === 3);
  check("stock on order is inventory, not cogs", poLines.every((l) => l.group === "inventory"));

  const receipts = factsFromReceipts([
    { id: "r1", po_line_id: "l2", qty: 60, unit_landed_cost: 826, received_at: "2027-03-25T08:00:00Z" },
    { id: "r2", po_line_id: "l2", qty: 5, unit_landed_cost: 826, received_at: "2026-12-01T08:00:00Z" },
  ], 2027);
  check("a receipt is an actual at landed cost", receipts.length === 1 && receipts[0].actual === 49560, receipts[0]?.actual);
  check("last year's receipt stays in last year", receipts.length === 1);

  const ship = factsFromShipmentCosts([
    { id: "s1", shipment_id: "SH", kind: "freight", amount: 8000, currency: "EUR", fx_rate: 1, is_estimate: true },
    { id: "s2", shipment_id: "SH", kind: "duty", amount: 4200, currency: "EUR", fx_rate: 1, is_estimate: false },
  ], new Map([["SH", "2027-03-25"]]), 2027);
  check("a quote is a commitment, an invoice is an actual",
        ship.find((s) => s.id === "s1")?.committed === 8000 && ship.find((s) => s.id === "s2")?.actual === 4200);
  check("neither is counted twice", sum(ship, "committed") === 8000 && sum(ship, "actual") === 4200);

  console.log("\nCash schedule\n");
  const cash = cashCommitments([
    { id: "m1", po_id: "PO1", kind: "deposit", planned_amount: 45000, planned_date: "2027-01-15", paid_amount: 45000, paid_date: "2027-01-18" },
    { id: "m2", po_id: "PO1", kind: "balance", planned_amount: 105000, planned_date: "2027-03-15", paid_amount: null, paid_date: null },
    { id: "m3", po_id: "PO2", kind: "deposit", planned_amount: 60000, planned_date: "2027-02-01", paid_amount: null, paid_date: null },
  ], pos as any, 2027);
  check("a cancelled order's payments disappear", !cash.some((c) => c.id === "m3"));
  check("a paid milestone reports the paid amount only",
        cash.find((c) => c.id === "m1")?.paid === 45000 && cash.find((c) => c.id === "m1")?.planned === 0);
  check("payment lands in the month it was actually paid", cash.find((c) => c.id === "m1")?.month === 1);
  check("an unpaid balance is still planned", cash.find((c) => c.id === "m2")?.planned === 105000);

  console.log("\nOrders\n");
  const orders = factsFromHwOrders([
    { id: "o1", order_number: "NP-1", status: "paid", total_net: 1900, total: 2261, placed_at: "2027-02-02", created_at: null },
    { id: "o2", order_number: "NP-2", status: "pending", total_net: 1900, total: 2261, placed_at: "2027-02-03", created_at: null },
    { id: "o3", order_number: "NP-3", status: "cancelled", total_net: 1900, total: 2261, placed_at: "2027-02-04", created_at: null },
  ], 2027);
  check("a cancelled order is not revenue", !orders.some((o) => o.id === "o3"));
  check("paid is actual, pending is committed",
        orders.find((o) => o.id === "o1")?.actual === 1900 && orders.find((o) => o.id === "o2")?.committed === 1900);
  check("net is used, never gross", orders.every((o) => o.actual + o.committed === 1900));

  console.log("\nAttaching facts to the lines that predicted them\n");
  const facts: SourceFact[] = [
    { table: "exp_costs", id: "a", label: "Hotel", href: null, month: 4, group: "cogs", committed: 1000, actual: 0, vendorId: null, editionId: null, basis: "accrual" },
    { table: "exp_costs", id: "b", label: "Flights", href: null, month: 5, group: "cogs", committed: 0, actual: 950, vendorId: null, editionId: null, basis: "accrual" },
    { table: "exp_costs", id: "f", label: "Orphan", href: null, month: null, group: "cogs", committed: 400, actual: 0, vendorId: null, editionId: null, basis: "accrual" },
  ];
  const att = attachFacts(facts, [
    { plan_line_id: "L1", source_table: "exp_costs", source_id: "a", share: 100 },
    { plan_line_id: "L1", source_table: "exp_costs", source_id: "b", share: 60 },
  ]);
  check("a claimed fact lands on its line, in its month", att.byLine.get("L1")?.committed[3] === 1000, att.byLine.get("L1")?.committed[3]);
  check("a partial claim takes its share", att.byLine.get("L1")?.actual[4] === 570, att.byLine.get("L1")?.actual[4]);
  check("...and the remainder is not lost", att.unclaimed.some((u) => u.id === "b" && u.actual === 380), att.unclaimed.map((u) => [u.id, u.actual]));
  check("an undated fact is unclaimed, never filed under January", att.unclaimed.some((u) => u.id === "f"));
  check("nothing vanishes: claimed + unclaimed = everything",
        Math.round((att.byLine.get("L1")!.actual.reduce((a, b) => a + b, 0) + att.unclaimed.reduce((s, u) => s + u.actual, 0)) * 100) / 100 === 950);

  const summary = summariseUnclaimed(facts);
  check("unclaimed facts group into one row per source", summary.length === 1 && summary[0].count === 3, summary.length);
  check("an undated amount is held apart, not in a month", summary[0].undatedCommitted === 400, summary[0].undatedCommitted);
  check("the total still includes it", summary[0].committedTotal === 1400, summary[0].committedTotal);

  console.log("\nAgainst the real database\n");
  const { data: realCosts } = await db.from("exp_costs")
    .select("id,item,estimated_amount,actual_amount,status,date,edition_id").limit(3000);
  const { data: realEds } = await db.from("exp_editions").select("id,date_start").limit(500);
  const edStart = new Map<string, string>(
    (realEds ?? []).filter((e: any) => e.date_start).map((e: any) => [e.id as string, e.date_start as string]),
  );
  const f2026 = factsFromExpCosts(realCosts ?? [], edStart, 2026);
  const f2027 = factsFromExpCosts(realCosts ?? [], edStart, 2027);
  console.log(`    2026: ${f2026.length} facts, committed €${sum(f2026, "committed").toLocaleString("de-DE")}, actual €${sum(f2026, "actual").toLocaleString("de-DE")}`);
  console.log(`    2027: ${f2027.length} facts, committed €${sum(f2027, "committed").toLocaleString("de-DE")}, actual €${sum(f2027, "actual").toLocaleString("de-DE")}`);
  check("Experience 2026 has real cost facts to show", f2026.length > 100, f2026.length);
  check("Experience 2027 already has some", f2027.length > 0, f2027.length);
  check("no real fact is both committed and actual", ![...f2026, ...f2027].some((f) => f.committed > 0 && f.actual > 0));
  check("every real fact carries a month", ![...f2026, ...f2027].some((f) => f.month === null));
  const orphaned = undatedExpCosts(realCosts ?? [], edStart);
  console.log(`    outside every budget: ${orphaned.count} costs, €${orphaned.amount.toLocaleString("de-DE")}`);
  check("nothing real is stranded without a date", orphaned.count === 0, orphaned);

  const { data: realPays } = await db.from("exp_payments")
    .select("id,amount,date,received_at,direction,status,vendor_id,experience_id").limit(4000);
  const rev2026 = factsFromExpPayments(realPays ?? [], 2026);
  console.log(`    2026 revenue: ${rev2026.length} payments, €${sum(rev2026, "actual").toLocaleString("de-DE")}`);
  check("real booking revenue is derivable", sum(rev2026, "actual") > 300000, sum(rev2026, "actual"));

  const { data: realPos } = await db.from("hw_purchase_orders").select("id,po_number,status,expected_receipt_date,order_date,supplier_id");
  const { data: realPoLines } = await db.from("hw_po_lines").select("id,po_id,qty_ordered,unit_cost,qty_received,qty_rejected");
  const poMap = new Map((realPos ?? []).map((p: any) => [p.id, p]));
  const hw2027 = factsFromPoLines(realPoLines ?? [], poMap as any, 2027);
  console.log(`    Performance 2027: ${(realPos ?? []).length} purchase orders, ${(realPoLines ?? []).length} lines, ${hw2027.length} commitments`);
  check("Performance derivation runs clean on the real tables", Array.isArray(hw2027));

  console.log(`\n${fail === 0 ? "ALL GREEN" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
