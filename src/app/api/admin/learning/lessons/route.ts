import { NextRequest, NextResponse } from "next/server";
import { slugifyLearning } from "@/lib/learning";
import { LESSON_FIELDS, learningDb, pick, requireAuthor } from "../guard";

/** POST /api/admin/learning/lessons — a new lesson inside a course.
 *  `course_id` is only ever read here, on create: a lesson does not change
 *  course later, which is why PATCH's whitelist has no such field. */
export async function POST(request: NextRequest) {
  const denied = await requireAuthor();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const courseId = typeof body.course_id === "string" ? body.course_id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!courseId) return NextResponse.json({ error: "course_id is required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });

  const db = learningDb();
  const { data: last } = await db
    .from("tr_lessons").select("sort_order").eq("course_id", courseId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();

  const base = slugifyLearning(typeof body.slug === "string" && body.slug ? body.slug : title) || "lesson";
  const row = {
    ...pick(body, LESSON_FIELDS),
    course_id: courseId,
    title,
    slug: base,
    sort_order: ((last?.sort_order as number) ?? 0) + 10,
  };

  let { data, error } = await db.from("tr_lessons").insert(row).select().single();
  // Two lessons called "Overview" in one course is a normal thing to want; the
  // author shouldn't have to invent a web address to get it.
  if (error?.message.includes("tr_lessons_course_id_slug_key")) {
    ({ data, error } = await db.from("tr_lessons").insert({ ...row, slug: `${base}-${Date.now().toString(36).slice(-4)}` }).select().single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
