import { NextRequest, NextResponse } from "next/server";
import { notArchived } from "@/lib/archive";
import { actingMember, learningDb } from "../guard";
import type { CourseCard, LearningCourse, LearningLesson, LessonCard } from "@/lib/learning";
import { sanitizeLessonHtml } from "@/lib/sanitize";

/**
 * GET /api/admin/learning/read — what the reader sees, and only that.
 *
 * Published rows only. Drafts belong to the author screens, which have their own
 * route: a half-written lesson appearing in someone's path is how a handbook
 * loses the team's trust the first week.
 *
 *   (no params)      → the catalog: every published course with its lesson
 *                      titles and this member's completions, but no bodies.
 *   ?course=<slug>   → that one course WITH every lesson body, because a lesson
 *                      is five minutes long and prev/next should not re-fetch.
 */
export async function GET(request: NextRequest) {
  const me = await actingMember();
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = learningDb();
  const slug = request.nextUrl.searchParams.get("course");

  const { data: doneRows } = await db.from("tr_progress").select("lesson_id, completed_at").eq("member_id", me.id);
  const completed = new Set(
    ((doneRows ?? []) as { lesson_id: string; completed_at: string | null }[])
      .filter((r) => r.completed_at)
      .map((r) => r.lesson_id)
  );

  if (slug) {
    const { data: course, error } = await db
      .from("tr_courses").select("*").eq("slug", slug).eq("status", "published").is("archived_at", null).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: rows } = await db
      .from("tr_lessons").select("*").eq("course_id", (course as LearningCourse).id)
      .eq("status", "published").order("sort_order");

    // Sanitize on the way OUT as well as on the way in. The two pages that show
    // this are client components, so they cannot sanitize without shipping the
    // sanitizer to the browser — and sanitizing in the browser is too late
    // anyway. Anything already stored, or written through a path added later,
    // is neutralised here.
    const lessons = (notArchived(rows) as LearningLesson[]).map((l) => ({
      ...l,
      body: sanitizeLessonHtml(l.body),
      completed: completed.has(l.id),
    }));
    const safeCourse = { ...(course as LearningCourse), description: sanitizeLessonHtml((course as LearningCourse).description) };
    return NextResponse.json({ member: { id: me.id, name: me.name }, course: safeCourse, lessons });
  }

  const { data: courseRows, error } = await db
    .from("tr_courses").select("*").eq("status", "published").order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const courses = notArchived(courseRows) as LearningCourse[];

  const { data: lessonRows } = courses.length
    ? await db.from("tr_lessons")
        .select("id, course_id, slug, title, summary, minutes, sort_order, route_hint, status, archived_at")
        .in("course_id", courses.map((c) => c.id))
        .eq("status", "published").order("sort_order")
    : { data: [] };

  const byCourse = new Map<string, LessonCard[]>();
  for (const l of notArchived(lessonRows) as (LessonCard & { course_id: string })[]) {
    const list = byCourse.get(l.course_id) ?? [];
    list.push({ ...l, completed: completed.has(l.id) });
    byCourse.set(l.course_id, list);
  }

  // "For me" = in this member's onboarding path: a required course that either
  // names no role at all or names one they hold. Courses aimed at somebody
  // else's role stay visible — the handbook is one corpus, the path is a view
  // over it — they just don't count towards anyone else's progress.
  const mine = new Set(me.roleIds);
  const cards: CourseCard[] = courses.map((c) => ({
    id: c.id, slug: c.slug, title: c.title, summary: c.summary, description: c.description,
    icon: c.icon, required: c.required, sort_order: c.sort_order, status: c.status,
    lessons: byCourse.get(c.id) ?? [],
    for_me: c.required && ((c.role_ids ?? []).length === 0 || (c.role_ids ?? []).some((r) => mine.has(r))),
  }));

  return NextResponse.json({ member: { id: me.id, name: me.name }, courses: cards });
}
