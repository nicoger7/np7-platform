import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { planHoursCosts, commitHoursCosts } from "@/lib/hours-cost";

export const dynamic = "force-dynamic";

/**
 * The "do it now" button. The nightly cron does this on its own — this exists
 * for when you have just logged hours and want the number before tomorrow.
 * GET previews, POST commits.
 */
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { costs, skipped } = await planHoursCosts(createAdminClient());
  return NextResponse.json({
    lines: costs.length,
    total: Math.round(costs.reduce((s, c) => s + c.estimated_amount, 0) * 100) / 100,
    costs: costs.map(({ hoursIds, ...c }) => ({ ...c, entries: hoursIds.length })),
    skipped,
  });
}

export async function POST() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await commitHoursCosts(createAdminClient())) });
}
