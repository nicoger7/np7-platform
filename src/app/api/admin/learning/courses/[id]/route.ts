import { NextRequest, NextResponse } from "next/server";
import { softDelete } from "@/lib/archive";
import { RESERVED_COURSE_SLUGS, slugifyLearning } from "@/lib/learning";
import { COURSE_FIELDS, learningDb, pick, requireAuthor } from "../../guard";
import { requireAdminGate } from "@/lib/admin-auth";
/** GET — the whole course as the editor needs it: every lesson, drafts and all,
 *  plus the roles and team members the form's pickers offer. One payload, so
 *  clicking between lessons never waits on the network. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const db = learningDb();
  const { id } = await params;

  const { data: course, error } = await db.from("tr_courses").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const [{ data: lessons }, { data: roles }, { data: members }] = await Promise.all([
    db.from("tr_lessons").select("*").eq("course_id", id).order("sort_order"),
    db.from("team_roles").select("id, name").order("name"),
    db.from("team_members").select("id, name").eq("active", true).order("name"),
  ]);

  return NextResponse.json({
    ...course,
    lessons: ((lessons ?? []) as { archived_at: string | null }[]).filter((l) => !l.archived_at),
    roles: roles ?? [],
    members: members ?? [],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuthor();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const patch = pick(body, COURSE_FIELDS);

  if (typeof patch.slug === "string") {
    patch.slug = slugifyLearning(patch.slug);
    if (!patch.slug) return NextResponse.json({ error: "That web address is empty after cleaning up." }, { status: 400 });
    if (RESERVED_COURSE_SLUGS.includes(patch.slug as string)) {
      return NextResponse.json({ error: `"${patch.slug}" is reserved by the academy's own pages.` }, { status: 400 });
    }
  }
  // Un-archive is an explicit flag rather than a writable column, so a stray
  // archived_at in a form payload can never resurrect a course by accident.
  if (body.restore === true) patch.archived_at = null;

  // There are no triggers in this database — forget this and the freshness dot
  // on the course list quietly stops telling the truth.
  patch.updated_at = new Date().toISOString();

  const { data, error } = await learningDb().from("tr_courses").update(patch).eq("id", id).select().single();
  if (error) {
    const dup = error.message.includes("tr_courses_slug_key");
    return NextResponse.json({ error: dup ? "A course already uses that web address." : error.message }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json(data);
}

/** DELETE — archives the course (and hides its lessons with it). Restorable
 *  from the author list's Archived filter. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAuthor();
  if (denied) return denied;

  const { id } = await params;
  const res = await softDelete(learningDb(), "tr_courses", id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ ok: true, archived: res.archived });
}
