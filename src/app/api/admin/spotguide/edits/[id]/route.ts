import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { applyEditToSpot, ADMIN_APPLY_FIELDS } from "@/lib/spotguide-trust";

/**
 * POST /api/admin/spotguide/edits/:id — NP7 moderation of a member-suggested
 * edit. Body { action: 'approve'|'reject'|'merged' }.
 *   approve — canonical (name/pin) applies to the spot now; an info suggestion
 *             is accepted (queued for AI/manual merge into the description).
 *   merged  — mark an accepted info suggestion as folded in (done).
 *   reject  — dismiss.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "reject" ? "reject" : body.action === "merged" ? "merged" : "approve";
  const now = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: edit } = await db.from("spot_edits").select("*").eq("id", id).maybeSingle();
  if (!edit) return NextResponse.json({ error: "Edit not found." }, { status: 404 });
  if (!["pending", "approved"].includes(edit.status)) return NextResponse.json({ ok: true, status: edit.status });

  if (action === "reject") {
    await db.from("spot_edits").update({ status: "rejected", updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }
  if (action === "merged") {
    await db.from("spot_edits").update({ status: "merged", updated_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, status: "merged" });
  }

  // approve
  if (!ADMIN_APPLY_FIELDS.has(edit.field)) {
    // info suggestion — accept it (queued for merge), don't touch the prose.
    await db.from("spot_edits").update({ status: "approved", applied_at: now }).eq("id", id);
    return NextResponse.json({ ok: true, status: "approved" });
  }
  const { data: spot } = await db.from("spots").select("id, destination_id, wind_stats, wind_profile").eq("id", edit.spot_id).maybeSingle();
  if (!spot) return NextResponse.json({ error: "Spot not found." }, { status: 404 });
  await applyEditToSpot(db, spot, edit.field, edit.new_value);
  await db.from("spot_edits").update({ status: "applied", applied_at: now, applied_by: null }).eq("id", id);
  await db.from("spot_edits").update({ status: "superseded", updated_at: now })
    .eq("spot_id", edit.spot_id).eq("field", edit.field).eq("status", "pending").neq("id", id);
  return NextResponse.json({ ok: true, status: "applied" });
}
