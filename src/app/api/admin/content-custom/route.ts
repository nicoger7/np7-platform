import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";

// GET /api/admin/content-custom — experiences whose method/outcomes copy has
// DETACHED from its template (an override is set). Feeds the Templates page's
// "customised" list, which is what keeps divergence visible.
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("exp_content")
    .select("experience_id, method_intro, method_steps, week_title, week_outcomes, exp_experiences(title)");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[])
    .map((c) => ({
      experience_id: c.experience_id,
      title: c.exp_experiences?.title ?? "Experience",
      methodCustom: Boolean((c.method_intro ?? "").trim() || (Array.isArray(c.method_steps) && c.method_steps.length)),
      outcomesCustom: Boolean((c.week_title ?? "").trim() || (Array.isArray(c.week_outcomes) && c.week_outcomes.length)),
    }))
    .filter((c) => c.methodCustom || c.outcomesCustom)
    .sort((a, b) => a.title.localeCompare(b.title));
  return NextResponse.json({ rows });
}
