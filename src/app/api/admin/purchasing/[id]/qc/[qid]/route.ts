import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// PATCH /api/admin/purchasing/:id/qc/:qid
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, qid } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["type", "inspector", "agency", "date", "aql_level", "result", "report_url", "notes"]) {
    if (k in body) update[k] = body[k] || null;
  }
  if ("sample_size" in body) update.sample_size = body.sample_size === "" || body.sample_size == null ? null : Number(body.sample_size);
  if ("blocks_balance_payment" in body) update.blocks_balance_payment = !!body.blocks_balance_payment;

  const { data, error } = await db.from("hw_qc_inspections").update(update).eq("id", qid).eq("po_id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// DELETE /api/admin/purchasing/:id/qc/:qid
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; qid: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, qid } = await params;
  const { error } = await db.from("hw_qc_inspections").delete().eq("id", qid).eq("po_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
