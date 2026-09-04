import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// POST /api/admin/inbound/:id/costs — landed-cost worksheet row
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.kind || body.amount == null || body.amount === "") {
    return NextResponse.json({ error: "kind and amount are required" }, { status: 400 });
  }

  const { data, error } = await db.from("hw_shipment_costs").insert({
    shipment_id: id,
    kind: body.kind,
    amount: Number(body.amount),
    currency: body.currency || "EUR",
    fx_rate: body.fx_rate != null && body.fx_rate !== "" ? Number(body.fx_rate) : 1,
    is_estimate: body.is_estimate !== false,
    invoice_ref: body.invoice_ref || null,
    allocation_basis: body.allocation_basis || (body.kind === "freight" ? "volume" : "value"),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
