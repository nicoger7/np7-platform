import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { getMemberLevelDetail, recomputeDerivedLevel } from "@/lib/portal-data";
import { normalizeLevel } from "@/lib/member-level";

type Ctx = { params: Promise<{ id: string }> };

// GET — the member's full level detail (level fields, milestone catalog + ticks,
// derived suggestion, history) for the admin "Level & skills" panel.
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  return NextResponse.json(await getMemberLevelDetail(id));
}

// POST — coach actions: tick/untick a milestone, or set/suggest a level. Setting
// a level verifies it when the member granted standing consent (or `verify`),
// otherwise it lands as a private suggestion they accept. Tolerant of migration
// 036 being unapplied (legacy `level` still saves; the rest is skipped).
export async function POST(req: NextRequest, { params }: Ctx) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const now = new Date().toISOString();
  const by = auth.member.teamMemberId;

  if (body.action === "toggle_milestone") {
    if (typeof body.milestone_id !== "string") return NextResponse.json({ error: "milestone_id required" }, { status: 400 });
    // A coach tick is authoritative: verified_via='coach' upgrades a member's
    // self-log (self → coach) so "confirm" sticks and counts toward rank.
    const q = body.achieved
      ? db.from("contact_milestones").upsert({ contact_id: id, milestone_id: body.milestone_id, set_by: by, achieved_at: now, verified_via: "coach" }, { onConflict: "contact_id,milestone_id" })
      : db.from("contact_milestones").delete().eq("contact_id", id).eq("milestone_id", body.milestone_id);
    const { error } = await q;
    if (error) return NextResponse.json({ ok: true, levelUnavailable: true });
    // milestone basis: a completed tier auto-sets the verified level
    const derived = await recomputeDerivedLevel(id, by);
    return NextResponse.json({ ok: true, derived });
  }

  if (body.action === "set_milestones") {
    // Bulk tick/untick (e.g. "Select all" for a whole tier) — one round-trip.
    const ids: string[] = Array.isArray(body.milestone_ids) ? body.milestone_ids.filter((x: unknown) => typeof x === "string") : [];
    if (ids.length === 0) return NextResponse.json({ error: "milestone_ids required" }, { status: 400 });
    const q = body.achieved
      ? db.from("contact_milestones").upsert(ids.map((mid) => ({ contact_id: id, milestone_id: mid, set_by: by, achieved_at: now, verified_via: "coach" })), { onConflict: "contact_id,milestone_id" })
      : db.from("contact_milestones").delete().eq("contact_id", id).in("milestone_id", ids);
    const { error } = await q;
    if (error) return NextResponse.json({ ok: true, levelUnavailable: true });
    const derived = await recomputeDerivedLevel(id, by);
    return NextResponse.json({ ok: true, derived });
  }

  if (body.action === "approve_self") {
    // one-click: verify the rider at the level they rated themselves
    const { data: c } = await db.from("contacts").select("self_level").eq("id", id).maybeSingle();
    const lv = normalizeLevel(c?.self_level);
    if (lv === "") return NextResponse.json({ error: "They haven't self-rated a level yet." }, { status: 400 });
    const { error } = await db.from("contacts").update({ level: lv, level_status: "verified", level_verified_at: now, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ ok: true, levelUnavailable: true });
    await db.from("contact_level_history").insert({ contact_id: id, level: lv, status: "verified", source: "coach", created_by: by });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "set_level") {
    const lv = normalizeLevel(body.level);
    if (lv === "") return NextResponse.json({ error: "Invalid level." }, { status: 400 });
    const { data: c } = await db.from("contacts").select("coach_can_manage_level").eq("id", id).maybeSingle();
    const verified = !!body.verify || !!c?.coach_can_manage_level;
    const update: Record<string, unknown> = { level: lv, level_status: verified ? "verified" : "suggested", updated_at: now };
    if (verified) update.level_verified_at = now;
    const { error } = await db.from("contacts").update(update).eq("id", id);
    if (error) {
      // 036 columns missing → still set the legacy coach level so the assessment sticks
      const { error: e2 } = await db.from("contacts").update({ level: lv, updated_at: now }).eq("id", id);
      if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
      return NextResponse.json({ ok: true, levelUnavailable: true });
    }
    await db.from("contact_level_history").insert({ contact_id: id, level: lv, status: verified ? "verified" : "suggested", source: "coach", created_by: by });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
