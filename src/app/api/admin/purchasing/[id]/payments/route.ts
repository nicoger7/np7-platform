import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { psiGateBlocks } from "@/lib/hardware/ops-server";

// POST /api/admin/purchasing/:id/payments — plan or record a factory payment
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  const num = (v: unknown) => (v === "" || v == null ? null : Number(v));

  // Marking a balance as PAID hits the PSI gate (override requires a note).
  if (body.kind === "balance" && body.paid_date && (await psiGateBlocks(db, id))) {
    if (!body.override) {
      return NextResponse.json({
        error: "Pre-shipment inspection hasn't passed — the balance payment is gated. Pass the PSI or override with a note.",
        gate: "psi",
      }, { status: 409 });
    }
  }

  const { data, error } = await db.from("hw_po_payments").insert({
    po_id: id,
    kind: body.kind || "other",
    planned_amount: num(body.planned_amount),
    planned_date: body.planned_date || null,
    paid_amount: num(body.paid_amount),
    paid_date: body.paid_date || null,
    fx_rate: num(body.fx_rate),
    reference: body.reference || null,
    notes: body.override ? `${body.notes ? body.notes + " " : ""}(PSI gate overridden)` : body.notes || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
