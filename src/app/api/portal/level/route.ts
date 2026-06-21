import { NextRequest, NextResponse } from "next/server";
import { requirePortalApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { normalizeLevel } from "@/lib/member-level";

// PUT — a member manages their own level: set their self-declared value, toggle
// standing consent for a coach to set+verify it, or accept/decline a pending
// coach suggestion. All fields are migration 036; writes degrade gracefully
// (levelUnavailable) until it's applied.
export async function PUT(request: NextRequest) {
  const auth = await requirePortalApi();
  if (!auth.ok) return auth.res;
  const body = await request.json().catch(() => ({}));
  const cid = auth.user.contactId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = new Date().toISOString();

  const update: Record<string, unknown> = {};
  let hLevel: string | null = null, hStatus: string | null = null, hSource = "self";

  if ("self_level" in body) {
    const lv = normalizeLevel(body.self_level);
    update.self_level = lv === "" ? null : lv;
    update.level_status = "self"; // editing your own value drops any verified badge
    hLevel = lv === "" ? null : lv; hStatus = "self"; hSource = "self";
  }

  if (typeof body.coach_can_manage_level === "boolean") {
    update.coach_can_manage_level = body.coach_can_manage_level;
    if (body.coach_can_manage_level) {
      // granting standing consent verifies the coach's current assessment, if any
      const { data: c } = await db.from("contacts").select("level").eq("id", cid).maybeSingle();
      if (c?.level) { update.level_status = "verified"; update.level_verified_at = now; hLevel = c.level; hStatus = "verified"; hSource = "coach"; }
    }
  }

  if (body.action === "accept") {
    const { data: c } = await db.from("contacts").select("level").eq("id", cid).maybeSingle();
    update.level_status = "verified"; update.level_verified_at = now;
    hLevel = c?.level ?? null; hStatus = "verified"; hSource = "coach";
  } else if (body.action === "decline") {
    update.level_status = "self";
    hStatus = "self"; hSource = "self";
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });
  update.updated_at = now;

  const { error } = await db.from("contacts").update(update).eq("id", cid);
  if (error) return NextResponse.json({ ok: true, levelUnavailable: true }); // migration 036 not applied

  if (hStatus) {
    // append to the progression timeline (tolerant: table absent → ignored)
    await db.from("contact_level_history").insert({ contact_id: cid, level: hLevel, status: hStatus, source: hSource });
  }
  return NextResponse.json({ ok: true });
}
