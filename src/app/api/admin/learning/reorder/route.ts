import { NextRequest, NextResponse } from "next/server";
import { learningDb, requireAuthor } from "../guard";

/**
 * POST /api/admin/learning/reorder — { kind: "course" | "lesson", ids: [...] }
 *
 * The client sends the whole list in its new order and every row gets rewritten
 * from its index. Swapping two neighbours' sort_order values is fewer writes but
 * drifts the moment anything else touches the table; at three courses and a few
 * dozen lessons, rewriting the list is free and always correct.
 */
export async function POST(request: NextRequest) {
  const denied = await requireAuthor();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const table = body.kind === "lesson" ? "tr_lessons" : body.kind === "course" ? "tr_courses" : null;
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === "string") : [];
  if (!table) return NextResponse.json({ error: "kind must be 'course' or 'lesson'" }, { status: 400 });
  if (!ids.length) return NextResponse.json({ ok: true });

  const db = learningDb();
  const now = new Date().toISOString();
  const results = await Promise.all(
    ids.map((id, i) => db.from(table).update({ sort_order: (i + 1) * 10, updated_at: now }).eq("id", id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
