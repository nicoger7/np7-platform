import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { resolveEdit } from "@/lib/spotguide-trust";

/**
 * POST /api/portal/spotguide/edits/confirm — a member confirms (or rejects) a
 * proposed edit. Body { editId, kind: 'confirm'|'reject' }. Can't confirm your
 * own. Recomputes the edit's resolution — a confirm from a specialist/moderator,
 * or enough plain confirms, applies it to the spot.
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Please sign in to confirm." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const editId = (body.editId ?? "").trim();
  const kind = body.kind === "reject" ? "reject" : "confirm";
  if (!editId) return NextResponse.json({ error: "Missing edit." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: edit } = await db.from("spot_edits").select("id, contact_id, status").eq("id", editId).maybeSingle();
  if (!edit) return NextResponse.json({ error: "Edit not found." }, { status: 404 });
  if (edit.contact_id === user.contactId) return NextResponse.json({ error: "You can't confirm your own suggestion." }, { status: 403 });
  if (edit.status !== "pending") return NextResponse.json({ ok: true, status: edit.status, applied: edit.status === "applied" });

  const { error } = await db.from("spot_edit_confirms").upsert(
    { edit_id: editId, contact_id: user.contactId, kind },
    { onConflict: "edit_id,contact_id" }
  );
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ error: "Spotguide isn't live yet." }, { status: 503 });
    return NextResponse.json({ error: "Could not record that." }, { status: 500 });
  }

  const res = kind === "confirm" ? await resolveEdit(db, editId) : { status: "pending", applied: false, confirms: 0, required: 0 };
  return NextResponse.json({ ok: true, status: res.status, applied: res.applied, confirms: res.confirms, required: res.required });
}
