import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { getEditionCrewLevels, recomputeDerivedLevel } from "@/lib/portal-data";

type Ctx = { params: Promise<{ id: string }> };

// GET — the whole cohort's level state + milestone catalog for the per-trip
// batch review. (Per-rider actions reuse /api/admin/members/[id]/level.)
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  return NextResponse.json(await getEditionCrewLevels(id));
}

// POST — bulk: tick/untick one skill across several riders at once
// ("everyone got planing this week"). Tolerant of migration 036 unapplied.
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  await params; // edition id not needed — contact_ids carry the targets
  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  if (body.action === "bulk_milestone") {
    const ids: string[] = Array.isArray(body.contact_ids) ? body.contact_ids.filter((x: unknown) => typeof x === "string") : [];
    if (typeof body.milestone_id !== "string" || ids.length === 0) return NextResponse.json({ error: "milestone_id and contact_ids required" }, { status: 400 });
    const now = new Date().toISOString();
    const q = body.achieved
      ? db.from("contact_milestones").upsert(ids.map((cid) => ({ contact_id: cid, milestone_id: body.milestone_id, set_by: auth.member.teamMemberId, achieved_at: now, verified_via: "coach" })), { onConflict: "contact_id,milestone_id" })
      : db.from("contact_milestones").delete().eq("milestone_id", body.milestone_id).in("contact_id", ids);
    const { error } = await q;
    if (error) return NextResponse.json({ ok: true, levelUnavailable: true });
    // milestone basis: re-derive each affected rider's verified level
    await Promise.all(ids.map((cid) => recomputeDerivedLevel(cid, auth.member.teamMemberId)));
    return NextResponse.json({ ok: true, updated: ids.length });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
