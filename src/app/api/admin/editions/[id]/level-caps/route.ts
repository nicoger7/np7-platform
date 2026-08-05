import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * How many of this week may be sold at each coaching level.
 *
 * A blank cap is not zero — it means "this level isn't capped", the same way a
 * week with no max_spots isn't capped. So clearing the field deletes the row
 * rather than storing 0, which would take that level off sale entirely.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;

  const body = (await request.json().catch(() => ({}))) as { caps?: Record<string, number | null> };
  const caps = body.caps ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const rows = Object.entries(caps)
    .filter(([lvl, v]) => lvl && typeof v === "number" && Number.isFinite(v) && v >= 0)
    .map(([level, max_spots]) => ({ edition_id: id, level, max_spots, updated_at: new Date().toISOString() }));
  const cleared = Object.entries(caps).filter(([, v]) => v == null).map(([lvl]) => lvl);

  if (cleared.length) {
    const { error } = await db.from("exp_edition_level_caps").delete().eq("edition_id", id).in("level", cleared);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (rows.length) {
    const { error } = await db.from("exp_edition_level_caps").upsert(rows, { onConflict: "edition_id,level" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
