import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import { loadCostsWithMoney, withMoney, attachedByCost, COST_SELECT, friendlyCostError, type CostRow } from "@/lib/finance/cost-ledger";
import { buildCostWrite } from "@/lib/finance/cost-write";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  try {
    const [row] = await loadCostsWithMoney(db, { ids: [id] });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

/**
 * PATCH — edit a line. The body is merged over the stored row before the
 * scope and provenance rules are checked, so a partial edit ("just the
 * estimate") never has to restate where the cost belongs, and an edit that
 * moves it somewhere incoherent is refused with the reason.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });

  const { data: existing } = await db.from("exp_costs").select("*").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const built = buildCostWrite(body, existing);
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  const { data, error } = await db.from("exp_costs").update(built.row).eq("id", id).select(COST_SELECT).single();
  if (error) return NextResponse.json({ error: friendlyCostError(error.message) }, { status: 400 });
  const attached = await attachedByCost(db, [id]);
  const [row] = withMoney([data as CostRow], attached);
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;
  const { error } = await client.from("exp_costs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
