import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST { edition_id } → clone this cost line onto another edition (same experience
// or the target edition's experience). Actual + notion_id are reset on the copy.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { edition_id } = await req.json().catch(() => ({}));
  if (!edition_id) return NextResponse.json({ error: "Missing edition_id" }, { status: 400 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: cost } = await db.from("exp_costs").select("*").eq("id", id).maybeSingle();
  if (!cost) return NextResponse.json({ error: "Cost not found" }, { status: 404 });
  const { data: ed } = await db.from("exp_editions").select("experience_id").eq("id", edition_id).maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  const { id: _id, created_at, updated_at, notion_id, ...rest } = cost;
  const insertRow = { ...rest, edition_id, experience_id: ed?.experience_id ?? cost.experience_id, actual_amount: null };

  let { data: created, error } = await db.from("exp_costs").insert(insertRow).select("*, exp_experiences(id, title)").single();
  if (error && /notion_id|column|schema cache/i.test(error.message || "")) {
    // pre-migration tolerance — retry without unknown columns
    const { notion_id: _n, ...clean } = insertRow as Record<string, unknown>;
    void _n;
    ({ data: created, error } = await db.from("exp_costs").insert(clean).select("*, exp_experiences(id, title)").single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(created, { status: 201 });
}
