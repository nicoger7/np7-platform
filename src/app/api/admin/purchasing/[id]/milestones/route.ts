import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST /api/admin/purchasing/:id/milestones
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.kind) return NextResponse.json({ error: "kind is required" }, { status: 400 });

  const { data, error } = await db.from("hw_po_milestones").insert({
    po_id: id,
    kind: body.kind,
    label: body.label || null,
    planned_date: body.planned_date || null,
    actual_date: body.actual_date || null,
    note: body.note || null,
    sort_order: body.sort_order != null ? Number(body.sort_order) : 0,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
