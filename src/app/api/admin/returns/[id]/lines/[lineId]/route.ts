import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// PATCH /api/admin/returns/:id/lines/:lineId — inspection verdict per line
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id, lineId } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if ("condition" in body) update.condition = body.condition || null;
  if ("reason_code" in body) update.reason_code = body.reason_code || null;

  const { data, error } = await db.from("hw_return_lines").update(update).eq("id", lineId).eq("return_id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
