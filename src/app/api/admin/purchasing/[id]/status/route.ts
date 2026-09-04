import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { PO_TRANSITIONS, type PoStatus } from "@/lib/hardware/ops";
import { requireAdminGate } from "@/lib/admin-auth";
// POST /api/admin/purchasing/:id/status — { to, note? } walk the PO ladder.
// Every transition is validated against the allowlist and logged.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const to = body.to as PoStatus;

  const { data: po, error } = await db.from("hw_purchase_orders").select("id,status,ex_factory_actual").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const allowed = PO_TRANSITIONS[po.status as PoStatus] ?? [];
  if (!allowed.includes(to)) {
    return NextResponse.json({ error: `Cannot go from ${po.status} to ${to}.` }, { status: 409 });
  }

  const update: Record<string, unknown> = { status: to, updated_at: new Date().toISOString() };
  // Shipping stamps the actual ex-factory date (lead-time analytics read this).
  if (to === "shipped" && !po.ex_factory_actual) update.ex_factory_actual = new Date().toISOString().slice(0, 10);

  const { data, error: upErr } = await db.from("hw_purchase_orders").update(update).eq("id", id).select().single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  await db.from("hw_po_status_events").insert({
    po_id: id, from_status: po.status, to_status: to, actor: "admin", note: body.note || null,
  });
  return NextResponse.json(data);
}
