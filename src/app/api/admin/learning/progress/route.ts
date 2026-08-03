import { NextRequest, NextResponse } from "next/server";
import { actingMember, learningDb } from "../guard";

/**
 * POST /api/admin/learning/progress — "I opened this" / "I've got this".
 *
 * The member is resolved from the session and never read from the body, so this
 * route can be personal (every team member may write here, whatever their role)
 * without becoming a way to mark somebody else's training done.
 *
 * `completed` is self-declared and deliberately un-audited. It is a bookmark,
 * not evidence: at this headcount whether someone can actually do the thing is
 * answered by watching them, and a number that pretends otherwise is worse than
 * no number.
 *
 * Body: { lesson_id, opened?: true, completed?: boolean }
 */
export async function POST(request: NextRequest) {
  const me = await actingMember();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const lessonId = typeof body.lesson_id === "string" ? body.lesson_id : null;
  if (!lessonId) return NextResponse.json({ error: "lesson_id is required" }, { status: 400 });

  const db = learningDb();
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("tr_progress").select("*").eq("lesson_id", lessonId).eq("member_id", me.id).maybeSingle();

  const row: Record<string, unknown> = { lesson_id: lessonId, member_id: me.id, updated_at: now };
  // First open only — a re-read shouldn't reset when this lesson entered the
  // member's life, which is the one thing opened_at is good for.
  row.opened_at = existing?.opened_at ?? now;
  if (typeof body.completed === "boolean") {
    row.completed_at = body.completed ? now : null;
  } else if (existing) {
    row.completed_at = existing.completed_at;
  }

  const { data, error } = await db.from("tr_progress").upsert(row, { onConflict: "lesson_id,member_id" }).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? row);
}
