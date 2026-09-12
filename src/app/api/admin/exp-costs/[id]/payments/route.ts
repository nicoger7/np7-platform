import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// Attach / detach an actual expense payment (exp_payments direction='cost') to a
// cost line, with an amount (partial allowed). Migration 057.
//
// This is the hand path: a cost payment somebody already typed. Money that
// comes off the bank ledger is attached by src/lib/bank/costs.ts instead,
// which also creates the payment row. Both land in the same table, and the
// same rule applies to both: a payment cannot be attached for more than it is.
function missing(m?: string | null) { return !!m && /relation|does not exist|schema cache/i.test(m); }

// POST { payment_id, amount } → upsert the attachment.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const { payment_id, amount } = await req.json().catch(() => ({}));
  if (!payment_id) return NextResponse.json({ error: "Missing payment_id" }, { status: 400 });
  const wanted = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(wanted > 0)) return NextResponse.json({ error: "Attach a positive amount." }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Over-allocation refused: the payment's other attachments plus this one
  // may not exceed the payment. Without this, one €3,090 hotel bill could be
  // counted on three editions and the P&L of each would carry it in full.
  const { data: pay } = await db.from("exp_payments").select("id, amount, direction").eq("id", payment_id).maybeSingle();
  if (!pay) return NextResponse.json({ error: "No such payment." }, { status: 404 });
  if (pay.direction !== "cost") return NextResponse.json({ error: "Only a cost payment can be attached to a cost line." }, { status: 400 });
  const { data: others } = await db.from("exp_cost_payment_allocations").select("cost_id, amount").eq("payment_id", payment_id).neq("cost_id", id);
  const used = Math.round(((others ?? []) as { amount: number | string | null }[]).reduce((s, a) => s + (Number(a.amount) || 0), 0) * 100) / 100;
  const free = Math.round(((Number(pay.amount) || 0) - used) * 100) / 100;
  if (wanted > free + 0.01) {
    return NextResponse.json({ error: `That payment is €${Number(pay.amount).toFixed(2)} and €${used.toFixed(2)} of it is already on other lines, so at most €${free.toFixed(2)} can go here.` }, { status: 400 });
  }

  const { error } = await db
    .from("exp_cost_payment_allocations")
    .upsert({ cost_id: id, payment_id, amount: wanted }, { onConflict: "cost_id,payment_id" });
  if (error) {
    if (missing(error.message)) return NextResponse.json({ error: "Run migration 057 first (exp_cost_payment_allocations)." }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE ?payment_id= → remove the attachment.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const payment_id = new URL(req.url).searchParams.get("payment_id");
  if (!payment_id) return NextResponse.json({ error: "Missing payment_id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("exp_cost_payment_allocations").delete().eq("cost_id", id).eq("payment_id", payment_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
