import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { getEditionReadiness } from "@/lib/email/readiness";

/**
 * Editions starting soon whose scheduled mails would be held back for missing
 * content. Scoped to the next 60 days — far enough out that you can still act,
 * near enough that it isn't noise about trips a year away.
 */
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const today = new Date();
  const horizon = new Date(today.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  const { data: eds } = await db
    .from("exp_editions")
    .select("id, year, label, date_start, exp_experiences(title)")
    .gte("date_start", today.toISOString().slice(0, 10))
    .lte("date_start", horizon)
    .order("date_start");

  const rows = [];
  for (const e of (eds ?? []) as { id: string; date_start: string; exp_experiences?: { title?: string } }[]) {
    const r = await getEditionReadiness(e.id, today).catch(() => null);
    if (!r || r.blockingMissing === 0) continue;
    rows.push({
      editionId: e.id,
      title: e.exp_experiences?.title ?? "Edition",
      startDate: e.date_start,
      daysToStart: r.daysToStart,
      missing: r.items.filter((i) => !i.present && i.blocks.length > 0).map((i) => i.label),
      overdue: r.items.some((i) => i.overdue && i.blocks.length > 0),
    });
  }
  return NextResponse.json({ gaps: rows });
}
