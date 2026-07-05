import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * wind.coach → NP7 skill-verification webhook (STUB — inert until WINDCOACH_WEBHOOK_SECRET is set).
 *
 * When a rider verifies a skill via a wind.coach video, wind.coach POSTs here and we
 * mark the milestone `verified_via = 'windcoach'`. Coach-verified (on an NP7 trip) always
 * outranks it — so a coach tick is never downgraded. See [[windcoach-integration]].
 *
 * Auth:  Authorization: Bearer <WINDCOACH_WEBHOOK_SECRET>   (or ?secret=)
 * Body:  { contact_id?: string, email?: string, skill_key: string, video_url?: string }
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.WINDCOACH_WEBHOOK_SECRET;
  if (!secret) return false; // fail-closed: not configured → reject
  const h = req.headers.get("authorization");
  return h === `Bearer ${secret}` || new URL(req.url).searchParams.get("secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const skill_key = typeof body.skill_key === "string" ? body.skill_key : "";
  const email = typeof body.email === "string" ? body.email : "";
  const video_url = typeof body.video_url === "string" ? body.video_url : null;
  let cid = typeof body.contact_id === "string" ? body.contact_id : "";
  if (!skill_key || (!cid && !email)) {
    return NextResponse.json({ error: "skill_key and contact_id|email required" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  if (!cid && email) {
    const c = await db.from("contacts").select("id").ilike("email", email).maybeSingle();
    cid = c.data?.id ?? "";
  }
  if (!cid) return NextResponse.json({ error: "contact not found" }, { status: 404 });

  const m = await db.from("level_milestones").select("id").eq("key", skill_key).eq("active", true).maybeSingle();
  if (!m.data?.id) return NextResponse.json({ error: "skill not found" }, { status: 404 });
  const milestone_id = m.data.id as string;

  // Never downgrade a coach tick to wind.coach.
  const existing = await db.from("contact_milestones").select("verified_via")
    .eq("contact_id", cid).eq("milestone_id", milestone_id).maybeSingle();
  if (existing.data?.verified_via === "coach") return NextResponse.json({ ok: true, skipped: "already coach-verified" });

  const now = new Date().toISOString();
  const { error } = await db.from("contact_milestones").upsert(
    { contact_id: cid, milestone_id, achieved_at: now, set_by: "windcoach", verified_via: "windcoach", verified_at: now, verified_ref: video_url },
    { onConflict: "contact_id,milestone_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, contact_id: cid, skill_key, verified_via: "windcoach" });
}
