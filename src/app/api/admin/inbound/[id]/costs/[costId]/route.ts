import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// PATCH /api/admin/inbound/:id/costs/:costId — true-up estimates to actuals
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; costId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, costId } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if ("kind" in body) update.kind = body.kind;
  if ("amount" in body) update.amount = Number(body.amount);
  if ("currency" in body) update.currency = body.currency || "EUR";
  if ("fx_rate" in body) update.fx_rate = body.fx_rate != null && body.fx_rate !== "" ? Number(body.fx_rate) : 1;
  if ("is_estimate" in body) update.is_estimate = !!body.is_estimate;
  if ("invoice_ref" in body) update.invoice_ref = body.invoice_ref || null;
  if ("allocation_basis" in body) update.allocation_basis = body.allocation_basis;

  const { data, error } = await db.from("hw_shipment_costs").update(update).eq("id", costId).eq("shipment_id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/inbound/:id/costs/:costId
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; costId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, costId } = await params;
  const { error } = await db.from("hw_shipment_costs").delete().eq("id", costId).eq("shipment_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
