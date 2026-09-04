import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/exp-costs/[id]/links — everything the cost detail needs:
// the cost's edition % split, its attached cost-payments (→ actual), and the
// pool of cost-direction payments available to attach (with remaining amount).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: cost } = await db.from("exp_costs").select("id, experience_id, edition_id, estimated_amount, actual_amount, item").eq("id", id).maybeSingle();
  if (!cost) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: editions } = cost.experience_id
    ? await db.from("exp_editions").select("id, label, year, date_start").eq("experience_id", cost.experience_id).order("date_start")
    : { data: [] };

  // Edition % split (migration 056) — tolerant if not applied.
  let editionAllocs: { edition_id: string; percent: number }[] = [];
  try { const { data } = await db.from("exp_cost_allocations").select("edition_id, percent").eq("cost_id", id); editionAllocs = data ?? []; } catch { editionAllocs = []; }

  // Attached cost-payments (migration 057) → drives the actual.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let paymentAllocs: any[] = [];
  try {
    const { data } = await db.from("exp_cost_payment_allocations").select("payment_id, amount, exp_payments(id, amount, date, reference, method, vendors(name))").eq("cost_id", id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paymentAllocs = (data ?? []).map((a: any) => ({ payment_id: a.payment_id, amount: Number(a.amount) || 0, payment: a.exp_payments }));
  } catch { paymentAllocs = []; }

  // Available cost-direction payments to attach (with how much is still free).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let available: any[] = [];
  try {
    const { data: costPays } = await db.from("exp_payments").select("id, amount, date, reference, method, vendors(name)").eq("direction", "cost").order("date", { ascending: false }).limit(300);
    const usedBy = new Map<string, number>();
    try {
      const { data: allAllocs } = await db.from("exp_cost_payment_allocations").select("payment_id, amount");
      for (const al of (allAllocs ?? [])) usedBy.set(al.payment_id, (usedBy.get(al.payment_id) || 0) + (Number(al.amount) || 0));
    } catch { /* table missing */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    available = (costPays ?? []).map((p: any) => {
      const used = usedBy.get(p.id) || 0;
      return { ...p, allocated: used, remaining: Math.round(((Number(p.amount) || 0) - used) * 100) / 100 };
    });
  } catch { available = []; }

  const attachedTotal = Math.round(paymentAllocs.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  return NextResponse.json({ cost, editions: editions ?? [], editionAllocs, paymentAllocs, available, attachedTotal });
}
