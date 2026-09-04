import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { notArchived } from "@/lib/archive";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/returns — the queue, newest first
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  let q = db.from("hw_returns")
    .select("id,type,status,channel,declared_at,refund_amount,archived_at, hw_orders(id,display_number,email), hw_return_lines(quantity)")
    .order("declared_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (notArchived(data) as any[]).map((r) => ({
    ...r,
    units: (r.hw_return_lines ?? []).reduce((a: number, l: { quantity: number }) => a + l.quantity, 0),
    hw_return_lines: undefined,
  }));
  return NextResponse.json(rows);
}
