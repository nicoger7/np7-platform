import { NextRequest, NextResponse } from "next/server";
import { RESERVED_COURSE_SLUGS, slugifyLearning, type LearningCourse } from "@/lib/learning";
import { COURSE_FIELDS, learningDb, pick, requireAuthor } from "../guard";
import { requireAdminGate } from "@/lib/admin-auth";
/** GET /api/admin/learning/courses — the author's list: drafts included, with
 *  lesson counts and the owner's name. `?archived=1` shows the archived ones so
 *  a course deleted by mistake is one click from coming back. */
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const db = learningDb();
  const archived = request.nextUrl.searchParams.get("archived") === "1";

  const { data, error } = await db.from("tr_courses").select("*").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const courses = ((data ?? []) as LearningCourse[]).filter((c) => (archived ? c.archived_at : !c.archived_at));

  const [{ data: lessons }, { data: members }] = await Promise.all([
    db.from("tr_lessons").select("course_id, status, minutes, archived_at"),
    db.from("team_members").select("id, name"),
  ]);

  const names = new Map(((members ?? []) as { id: string; name: string }[]).map((m) => [m.id, m.name]));
  const counts = new Map<string, { lessons: number; published: number; minutes: number }>();
  for (const l of (lessons ?? []) as { course_id: string; status: string; minutes: number; archived_at: string | null }[]) {
    if (l.archived_at) continue;
    const c = counts.get(l.course_id) ?? { lessons: 0, published: 0, minutes: 0 };
    c.lessons++;
    if (l.status === "published") { c.published++; c.minutes += l.minutes || 0; }
    counts.set(l.course_id, c);
  }

  return NextResponse.json(courses.map((c) => ({
    ...c,
    owner_name: c.owner_id ? names.get(c.owner_id) ?? null : null,
    ...(counts.get(c.id) ?? { lessons: 0, published: 0, minutes: 0 }),
  })));
}

/** POST /api/admin/learning/courses — a new track. */
export async function POST(request: NextRequest) {
  const denied = await requireAuthor();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const slug = slugifyLearning(typeof body.slug === "string" && body.slug ? body.slug : title);
  if (!slug) return NextResponse.json({ error: "That title doesn't make a usable web address — add a word or two." }, { status: 400 });
  if (RESERVED_COURSE_SLUGS.includes(slug)) {
    return NextResponse.json({ error: `"${slug}" is reserved by the academy's own pages — pick another address.` }, { status: 400 });
  }

  const db = learningDb();
  // New courses land at the bottom; reordering is a separate, explicit action.
  const { data: last } = await db.from("tr_courses").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();

  const row = {
    ...pick(body, COURSE_FIELDS),
    title, slug,
    sort_order: ((last?.sort_order as number) ?? 0) + 10,
  };
  const { data, error } = await db.from("tr_courses").insert(row).select().single();
  if (error) {
    const dup = error.message.includes("tr_courses_slug_key");
    return NextResponse.json({ error: dup ? "A course already uses that web address." : error.message }, { status: dup ? 409 : 500 });
  }
  return NextResponse.json(data);
}
