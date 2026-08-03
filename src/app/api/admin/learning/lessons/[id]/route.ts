import { NextRequest, NextResponse } from "next/server";
import { softDelete } from "@/lib/archive";
import { slugifyLearning } from "@/lib/learning";
import { LESSON_FIELDS, learningDb, pick, requireAuthor } from "../../guard";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuthor();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch = pick(body, LESSON_FIELDS);

  if (typeof patch.slug === "string") {
    patch.slug = slugifyLearning(patch.slug) || null;
    if (!patch.slug) delete patch.slug; // an emptied field keeps the old address rather than breaking every link to it
  }
  if (Array.isArray(patch.takeaways)) {
    patch.takeaways = (patch.takeaways as unknown[]).map((t) => String(t).trim()).filter(Boolean);
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await learningDb().from("tr_lessons").update(patch).eq("id", id).select().single();
  if (error) {
    const dup = error.message.includes("tr_lessons_course_id_slug_key");
    return NextResponse.json({ error: dup ? "Another lesson in this course already uses that web address." : error.message }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json(data);
}

/** DELETE — archives the lesson. Its tr_progress rows stay: they are the record
 *  that somebody read it, and they should survive a rewrite of the course. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuthor();
  if (denied) return denied;

  const { id } = await params;
  const res = await softDelete(learningDb(), "tr_lessons", id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, archived: res.archived });
}
