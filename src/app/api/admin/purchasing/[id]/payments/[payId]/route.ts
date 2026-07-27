import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { psiGateBlocks } from "@/lib/hardware/ops-server";

// PATCH /api/admin/purchasing/:id/payments/:payId — the PSI gate applies when
// a balance payment is being marked paid.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; payId: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, payId } = await params;
  const body = await request.json();
  const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

  const { data: existing } = await db.from("hw_po_payments").select("kind,paid_date").eq("id", payId).single();
  const becomingPaid = body.paid_date && !existing?.paid_date;
  if (existing?.kind === "balance" && becomingPaid && (await psiGateBlocks(db, id))) {
    if (!body.override) {
      return NextResponse.json({
        error: "Pre-shipment inspection hasn't passed — the balance payment is gated. Pass the PSI or override with a note.",
        gate: "psi",
      }, { status: 409 });
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["planned_amount", "paid_amount", "fx_rate"]) if (k in body) update[k] = num(body[k]);
  for (const k of ["planned_date", "paid_date", "reference", "notes", "kind"]) if (k in body) update[k] = body[k] || null;
  if (body.override) update.notes = `${body.notes ? body.notes + " " : ""}(PSI gate overridden)`;

  const { data, error } = await db.from("hw_po_payments").update(update).eq("id", payId).eq("po_id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/purchasing/:id/payments/:payId
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; payId: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, payId } = await params;
  const { error } = await db.from("hw_po_payments").delete().eq("id", payId).eq("po_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
