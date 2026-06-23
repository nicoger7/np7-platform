import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Attach / detach an actual expense payment (exp_payments direction='cost') to a
// cost line, with an amount (partial allowed). Migration 057.
function missing(m?: string | null) { return !!m && /relation|does not exist|schema cache/i.test(m); }

// POST { payment_id, amount } → upsert the attachment.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { payment_id, amount } = await req.json().catch(() => ({}));
  if (!payment_id) return NextResponse.json({ error: "Missing payment_id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db
    .from("exp_cost_payment_allocations")
    .upsert({ cost_id: id, payment_id, amount: Math.round((Number(amount) || 0) * 100) / 100 }, { onConflict: "cost_id,payment_id" });
  if (error) {
    if (missing(error.message)) return NextResponse.json({ error: "Run migration 057 first (exp_cost_payment_allocations)." }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE ?payment_id= → remove the attachment.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment_id = new URL(req.url).searchParams.get("payment_id");
  if (!payment_id) return NextResponse.json({ error: "Missing payment_id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("exp_cost_payment_allocations").delete().eq("cost_id", id).eq("payment_id", payment_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
