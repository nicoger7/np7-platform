import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { effectiveAddonStatus } from "@/lib/addons";

// GET /api/admin/editions/[id]/pnl — the real per-edition P&L:
//   received  = Σ revenue payments (status paid) on this edition's bookings, minus refunds
//   expected  = same, including not-yet-paid revenue
//   costs     = Σ direct costs (edition_id = this, no allocation) + Σ allocated shares
//               (split costs: amount × percent for allocations landing on this edition)
//   net       = received − costs
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await getRequestAccess();
  if (access && !effectiveCanSeeField(access, "money")) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // ── Revenue: payments on this edition's bookings ──
  const { data: bookings } = await db.from("exp_bookings").select("id, name, status, agreed_price, package_id, downpayment_received, deposit_received, final_payment_received, exp_packages(name)").eq("edition_id", id);
  const bookingIds = (bookings ?? []).map((b: { id: string }) => b.id);
  let received = 0, expected = 0;
  const receivedBy = new Map<string, number>();
  if (bookingIds.length) {
    const { data: pays } = await db.from("exp_payments").select("booking_id,amount,direction,type,status").in("booking_id", bookingIds);
    for (const p of (pays ?? [])) {
      if (p.direction === "cost") continue;
      const a = (p.type === "refund" ? -1 : 1) * (Number(p.amount) || 0);
      expected += a;
      if (p.status === "paid") {
        received += a;
        if (p.booking_id) receivedBy.set(p.booking_id, (receivedBy.get(p.booking_id) || 0) + a);
      }
    }
  }

  // ── Income: what each booking SOLD for (agreed price + confirmed billable
  //    add-ons), per booking — the revenue side the Costs tab never showed ──
  const soldAddonsBy = new Map<string, number>();
  if (bookingIds.length) {
    try {
      const { data: sold } = await db.from("exp_booking_addons")
        .select("booking_id, price, status, notes, payment_mode").in("booking_id", bookingIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (sold ?? []) as any[]) {
        // same definition as the invoice engine: confirmed and billed by us
        if (effectiveAddonStatus(a) !== "confirmed" || a.payment_mode === "direct") continue;
        soldAddonsBy.set(a.booking_id, (soldAddonsBy.get(a.booking_id) || 0) + (Number(a.price) || 0));
      }
    } catch { /* add-ons optional */ }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const SECURED = new Set(["confirmed", "paid", "attended"]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const incomeRows = ((bookings ?? []) as any[])
    .filter((b) => !["lost", "cancelled"].includes(String(b.status ?? "").toLowerCase()))
    .map((b) => {
      const addons = r2(soldAddonsBy.get(b.id) || 0);
      const total = r2((Number(b.agreed_price) || 0) + addons);
      const secured = SECURED.has(String(b.status ?? "").toLowerCase()) || !!b.downpayment_received || !!b.final_payment_received;
      return {
        id: b.id, name: b.name ?? "Booking", status: b.status ?? null,
        packageName: b.exp_packages?.name ?? null,
        agreed: r2(Number(b.agreed_price) || 0), addons, total,
        received: r2(receivedBy.get(b.id) || 0),
        secured,
      };
    })
    .sort((a, b) => b.total - a.total);
  const sumIf = (pred: (r: typeof incomeRows[number]) => boolean) => r2(incomeRows.filter(pred).reduce((s, r) => s + r.total, 0));
  const scenarios = {
    // best case: every live booking pays what was agreed
    everything: { income: sumIf(() => true), bookings: incomeRows.length },
    // realistic: only bookings whose spot is money-secured
    secured: { income: sumIf((r) => r.secured), bookings: incomeRows.filter((r) => r.secured).length },
    // floor: only money actually in the bank
    paid: { income: r2(received), bookings: incomeRows.filter((r) => r.received > 0).length },
  };

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
  // "Coming" = the securing payment is in: status confirmed/paid/attended (confirmed
  // IS deposit-or-downpayment-paid), or a row whose deposit/down-payment is flagged
  // received. Not-yet-paid reservations, leads and lost are excluded.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attending = (bookings ?? []).filter((b: any) =>
    b.package_id && (["confirmed", "paid", "attended"].includes(String(b.status || "").toLowerCase()) || b.downpayment_received === true || b.deposit_received === true)
  );
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of attending as any[]) {
    for (const line of (pkgLines.get(b.package_id) ?? [])) {
      const ex = compAgg.get(line.component_id) ?? { name: line.name, unit_cost: line.unit_cost, qty: 0, total: 0 };
      ex.qty += line.quantity;
      ex.total += line.unit_cost * line.quantity;
      compAgg.set(line.component_id, ex);
    }
  }

  // Confirmed add-ons feed the same lines — an extra rig week is more of the
  // same component, not a separate species of cost.
  try {
    const { data: addons } = await db
      .from("exp_booking_addons")
      .select("component_id, quantity, status, booking_id, exp_components(id, name, unit_cost)")
      .in("booking_id", bookingIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (addons ?? []) as any[]) {
      if (String(a.status ?? "confirmed") === "requested") continue;
      const c = a.exp_components;
      if (!c) continue;
      const qty = Number(a.quantity) || 1;
      const ex = compAgg.get(c.id) ?? { name: c.name, unit_cost: Number(c.unit_cost) || 0, qty: 0, total: 0 };
      ex.qty += qty;
      ex.total += (Number(c.unit_cost) || 0) * qty;
      compAgg.set(c.id, ex);
    }
  } catch { /* add-ons table optional */ }

  // Actuals override estimates, line by line. An exp_costs row carrying a
  // component_id IS that component's real bill — it already counts in `costs`
  // above, so its estimate must not count again. Estimated lines keep
  // contributing until their real number arrives.
  const { data: actualRows } = await db
    .from("exp_costs")
    .select("component_id, actual_amount, estimated_amount")
    .eq("edition_id", id)
    .not("component_id", "is", null);
  const actualBy = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (actualRows ?? []) as any[]) {
    actualBy.set(String(r.component_id), Number(r.actual_amount ?? r.estimated_amount) || 0);
  }

  let componentTotal = 0;
  const componentBreakdown = [...compAgg.entries()]
    .map(([cid, c]) => {
      const actual = actualBy.get(cid) ?? null;
      if (actual == null) componentTotal += c.total; // only un-overridden estimates add here
      return { componentId: cid, name: c.name, qty: c.qty, unitCost: c.unit_cost, total: Math.round(c.total * 100) / 100, actual };
    })
    .sort((a, b) => (b.actual ?? b.total) - (a.actual ?? a.total));

  return NextResponse.json({
    received: Math.round(received * 100) / 100,
    expected: Math.round(expected * 100) / 100,
    costs,
    net: Math.round((received - costs) * 100) / 100,
    bookings: bookingIds.length,
    componentEstimate: { total: Math.round(componentTotal * 100) / 100, bookings: attending.length, breakdown: componentBreakdown },
    income: incomeRows,
    scenarios,
  });
}
