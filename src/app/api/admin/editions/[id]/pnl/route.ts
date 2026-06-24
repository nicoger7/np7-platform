import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/editions/[id]/pnl — the real per-edition P&L:
//   received  = Σ revenue payments (status paid) on this edition's bookings, minus refunds
//   expected  = same, including not-yet-paid revenue
//   costs     = Σ direct costs (edition_id = this, no allocation) + Σ allocated shares
//               (split costs: amount × percent for allocations landing on this edition)
//   net       = received − costs
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // ── Revenue: payments on this edition's bookings ──
  const { data: bookings } = await db.from("exp_bookings").select("id, status, package_id").eq("edition_id", id);
  const bookingIds = (bookings ?? []).map((b: { id: string }) => b.id);
  let received = 0, expected = 0;
  if (bookingIds.length) {
    const { data: pays } = await db.from("exp_payments").select("amount,direction,type,status").in("booking_id", bookingIds);
    for (const p of (pays ?? [])) {
      if (p.direction === "cost") continue;
      const a = (p.type === "refund" ? -1 : 1) * (Number(p.amount) || 0);
      expected += a;
      if (p.status === "paid") received += a;
    }
  }

  // A cost's "real" spent: attached expense payments (Σ) if any, else the manual
  // actual, else the estimate.
  const attachedByCost = new Map<string, number>();
  try {
    const { data: cpa } = await db.from("exp_cost_payment_allocations").select("cost_id, amount");
    for (const a of (cpa ?? [])) attachedByCost.set(a.cost_id, (attachedByCost.get(a.cost_id) || 0) + (Number(a.amount) || 0));
  } catch { /* pre-migration-057 */ }
  const costAmount = (c: { id: string; actual_amount: number | null; estimated_amount: number | null }) => {
    const attached = attachedByCost.get(c.id) || 0;
    if (attached > 0) return attached;
    return c.actual_amount != null ? Number(c.actual_amount) : Number(c.estimated_amount) || 0;
  };

  // ── Costs: which cost_ids have explicit allocations (those use the split,
  //    not their single edition_id) ──
  let allocatedCostIds = new Set<string>();
  let allocatedHere = 0;
  try {
    const { data: allocs } = await db
      .from("exp_cost_allocations")
      .select("cost_id, percent, edition_id, exp_costs(id, estimated_amount, actual_amount, status)");
    for (const a of (allocs ?? [])) {
      allocatedCostIds.add(a.cost_id);
      const c = a.exp_costs;
      if (a.edition_id === id && c && c.status !== "cancelled") {
        allocatedHere += costAmount(c) * (Number(a.percent) || 0) / 100;
      }
    }
  } catch {
    // pre-migration-056 → no allocations; direct costs only
    allocatedCostIds = new Set();
    allocatedHere = 0;
  }

  // Direct costs on this edition that AREN'T split elsewhere → full amount.
  const { data: directCosts } = await db.from("exp_costs").select("id,estimated_amount,actual_amount,status").eq("edition_id", id);
  let directHere = 0;
  for (const c of (directCosts ?? [])) {
    if (c.status === "cancelled" || allocatedCostIds.has(c.id)) continue;
    directHere += costAmount(c);
  }

  const costs = Math.round((directHere + allocatedHere) * 100) / 100;

  // ── Projected component (per-participant) costs from the signed-up packages ──
  // For everyone who's committed (reserved → attended, not lost/lead), roll up
  // their package's components × cost price × quantity, aggregated per component.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attending = (bookings ?? []).filter((b: any) => b.package_id && !["lost", "lead"].includes(String(b.status || "").toLowerCase()));
  const pkgIds = [...new Set(attending.map((b: { package_id: string }) => b.package_id))];
  const pkgLines = new Map<string, { component_id: string; name: string; unit_cost: number; quantity: number }[]>();
  if (pkgIds.length) {
    const { data: pc } = await db.from("exp_package_components").select("package_id, quantity, exp_components(id, name, unit_cost)").in("package_id", pkgIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (pc ?? []) as any[]) {
      const c = row.exp_components;
      if (!c) continue;
      const arr = pkgLines.get(row.package_id) ?? [];
      arr.push({ component_id: c.id, name: c.name, unit_cost: Number(c.unit_cost) || 0, quantity: Number(row.quantity) || 1 });
      pkgLines.set(row.package_id, arr);
    }
  }
  const compAgg = new Map<string, { name: string; unit_cost: number; qty: number; total: number }>();
  let componentTotal = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of attending as any[]) {
    for (const line of (pkgLines.get(b.package_id) ?? [])) {
      const ex = compAgg.get(line.component_id) ?? { name: line.name, unit_cost: line.unit_cost, qty: 0, total: 0 };
      ex.qty += line.quantity;
      ex.total += line.unit_cost * line.quantity;
      compAgg.set(line.component_id, ex);
      componentTotal += line.unit_cost * line.quantity;
    }
  }
  const componentBreakdown = [...compAgg.values()]
    .map((c) => ({ name: c.name, qty: c.qty, unitCost: c.unit_cost, total: Math.round(c.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    received: Math.round(received * 100) / 100,
    expected: Math.round(expected * 100) / 100,
    costs,
    net: Math.round((received - costs) * 100) / 100,
    bookings: bookingIds.length,
    componentEstimate: { total: Math.round(componentTotal * 100) / 100, bookings: attending.length, breakdown: componentBreakdown },
  });
}
