import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
import { friendlyCostError } from "@/lib/finance/cost-ledger";
// POST { edition_id } → clone this cost line onto another edition (same experience
// or the target edition's experience). Actual + notion_id are reset on the copy,
// and so is everything that made the original "real": a typed actual and its
// provenance, the unplanned mark. The copy is an EXPECTED line on ONE trip,
// whatever scope the original had; that is what "copy to an edition" means.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  const { edition_id } = await req.json().catch(() => ({}));
  if (!edition_id) return NextResponse.json({ error: "Missing edition_id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: cost } = await db.from("exp_costs").select("*").eq("id", id).maybeSingle();
  if (!cost) return NextResponse.json({ error: "Cost not found" }, { status: 404 });
  const { data: ed } = await db.from("exp_editions").select("experience_id").eq("id", edition_id).maybeSingle();
  if (!ed) return NextResponse.json({ error: "Edition not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at, updated_at, notion_id, ...rest } = cost;
  const insertRow = {
    ...rest,
    scope: "edition",
    edition_id,
    experience_id: ed.experience_id ?? cost.experience_id,
    year: null,
    scope_reason: null,
    actual_amount: null,
    actual_provenance: null,
    actual_note: null,
    unplanned: false,
    status: cost.status === "cancelled" ? "estimate" : cost.status,
  };

  const { data: created, error } = await db.from("exp_costs").insert(insertRow).select("*, exp_experiences(id, title)").single();
  if (error) return NextResponse.json({ error: friendlyCostError(error.message) }, { status: 400 });
  return NextResponse.json(created, { status: 201 });
}
