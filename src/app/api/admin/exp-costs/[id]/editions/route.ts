import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// PUT /api/admin/exp-costs/[id]/editions  body { allocations: [{edition_id, percent}] }
// Replaces the cost's edition % split (migration 056). Empty → single-edition fallback.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (Array.isArray(body.allocations) ? body.allocations : [])
    .filter((a: { edition_id?: string; percent?: number }) => a.edition_id && Number(a.percent) > 0)
    .map((a: { edition_id: string; percent: number }) => ({ cost_id: id, edition_id: a.edition_id, percent: Math.round(Number(a.percent) * 100) / 100 }));

  const { error: delErr } = await db.from("exp_cost_allocations").delete().eq("cost_id", id);
  if (delErr && /relation|does not exist|schema cache/i.test(delErr.message || "")) {
    return NextResponse.json({ error: "Run migration 056 first (exp_cost_allocations)." }, { status: 503 });
  }
  if (rows.length) {
    const { error } = await db.from("exp_cost_allocations").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
