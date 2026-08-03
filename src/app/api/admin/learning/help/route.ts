import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * The lesson for the page you are standing on.
 *
 * A training course you have to remember to go and open is a course nobody
 * opens twice. The admin track is reference material — you want it at the
 * moment you are staring at a field you don't recognise, not in a catalogue.
 * Every lesson carries a `route_hint`, so the shell can ask "what covers
 * /admin/editions?" and put it one keystroke away.
 *
 * Longest matching prefix wins, so /admin/editions/<id> finds the editions
 * lesson without every lesson needing to enumerate its sub-routes.
 */
export async function GET(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;

  const path = new URL(request.url).searchParams.get("path") || "";
  if (!path.startsWith("/admin")) return NextResponse.json({ lesson: null });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("tr_lessons")
    .select("slug, title, summary, minutes, route_hint, tr_courses(slug, title)")
    .eq("status", "published")
    .is("archived_at", null)
    .not("route_hint", "is", null);

  type Row = {
    slug: string; title: string; summary: string | null; minutes: number | null;
    route_hint: string; tr_courses: { slug: string; title: string } | null;
  };
  const best = ((data ?? []) as Row[])
    .filter((l) => path === l.route_hint || path.startsWith(l.route_hint + "/") || path.startsWith(l.route_hint))
    .sort((a, b) => b.route_hint.length - a.route_hint.length)[0];

  return NextResponse.json({
    lesson: best
      ? {
          href: `/admin/learning/${best.tr_courses?.slug ?? ""}#${best.slug}`,
          title: best.title,
          summary: best.summary,
          minutes: best.minutes,
          course: best.tr_courses?.title ?? null,
        }
      : null,
  });
}
