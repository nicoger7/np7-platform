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

  /*
   * Which world the page belongs to.
   *
   * One lesson is hinted at plain /admin, so it matched every page in the
   * admin and offered "How the admin is laid out", written entirely about
   * bookings and editions, to somebody standing on the NP7 Performance budget.
   * A lesson now has to be about the world you are in, or about no world.
   */
  const world =
    path.startsWith("/admin/performance") || path.startsWith("/admin/hardware") ? "hardware"
    : path.startsWith("/admin/experience") ? "experience"
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("tr_lessons")
    .select("slug, title, summary, minutes, route_hint, world, tr_courses(slug, title)")
    .eq("status", "published")
    .is("archived_at", null)
    .not("route_hint", "is", null);

  type Row = {
    slug: string; title: string; summary: string | null; minutes: number | null;
    route_hint: string; world: string | null; tr_courses: { slug: string; title: string } | null;
  };
  const best = ((data ?? []) as Row[])
    // A lesson with no world suits any page; one with a world suits only its own.
    .filter((l) => l.world == null || l.world === world)
    // On a segment boundary only, so /admin/editions cannot claim
    // /admin/editions-archive by being a prefix of its name.
    .filter((l) => path === l.route_hint || path.startsWith(l.route_hint + "/"))
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
