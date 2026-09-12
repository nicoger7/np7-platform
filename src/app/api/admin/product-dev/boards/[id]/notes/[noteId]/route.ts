import { NextRequest, NextResponse } from "next/server";
import { pdDb, requirePdEdit, pickEditable } from "@/lib/product-dev-api";
import { requireAdminGate } from "@/lib/admin-auth";

const EDITABLE = ["body", "status", "filed", "duration_s"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const { id, noteId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const update = { ...pickEditable(body, EDITABLE), updated_at: new Date().toISOString() };
  // board_id in the filter, not just the id: a note id from another board must
  // not be patchable through this board's URL.
  const { data, error } = await pdDb()
    .from("pd_board_notes").update(update).eq("id", noteId).eq("board_id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** A hard delete. These are scratch notes, and the Archive has no entity for
 *  them — keeping a discarded voice memo forever helps nobody. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const edit = await requirePdEdit();
  if (edit) return edit;

  const { id, noteId } = await params;
  const { error } = await pdDb().from("pd_board_notes").delete().eq("id", noteId).eq("board_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
