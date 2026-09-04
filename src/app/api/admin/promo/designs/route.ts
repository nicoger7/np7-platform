import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// GET /api/admin/promo/designs — saved promo designs, newest first
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client
    .from("exp_promo_designs")
    .select("id, name, format, state, updated_at")
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  // Tolerate the table not existing yet (migration 186 pending) — the studio
  // works without persistence, so an empty list beats a broken page.
  if (error) return NextResponse.json([]);
  return NextResponse.json(data);
}

// POST /api/admin/promo/designs — save a new design
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const body = await request.json();
  const { data, error } = await client
    .from("exp_promo_designs")
    .insert({ name: body.name || "Untitled", format: body.format || "45", state: body.state })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
