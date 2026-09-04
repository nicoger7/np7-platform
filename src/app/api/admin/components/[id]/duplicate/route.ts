import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireAdminGate } from "@/lib/admin-auth";
// POST /api/admin/components/:id/duplicate — copy a component
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { id } = await params;

  const { data: original, error } = await client
    .from("exp_components")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !original) {
    return NextResponse.json({ error: error?.message || "Not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  const { id: _id, created_at, updated_at, notion_id, ...rest } = original as any;
  const { data: copy, error: copyErr } = await client
    .from("exp_components")
    .insert({ ...rest, name: `${original.name} (copy)` })
    .select("*, exp_experiences(id, title)")
    .single();
  if (copyErr) return NextResponse.json({ error: copyErr.message }, { status: 400 });
  return NextResponse.json(copy, { status: 201 });
}
