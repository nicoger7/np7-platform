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
  const { data: bookings } = await db.from("exp_bookings").select("id").eq("edition_id", id);
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

  const costAmount = (c: { actual_amount: number | null; estimated_amount: number | null }) =>
    c.actual_amount != null ? Number(c.actual_amount) : Number(c.estimated_amount) || 0;

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
  return NextResponse.json({
    received: Math.round(received * 100) / 100,
    expected: Math.round(expected * 100) / 100,
    costs,
    net: Math.round((received - costs) * 100) / 100,
    bookings: bookingIds.length,
  });
}
