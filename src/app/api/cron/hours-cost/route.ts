import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase";
import { commitHoursCosts, planHoursCosts } from "@/lib/hours-cost";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Nightly: turn logged hours into edition costs.
 *
 * There is nothing for a human to decide here. The hours are logged, the rate
 * is on the person, and the arithmetic is fixed — so making someone press a
 * button just means the margin is wrong until they remember. It ran once by
 * hand in June and then not for two months, which is exactly the failure mode.
 *
 * Idempotent by `hours_log.processed_at`: an hour is costed once, so running
 * nightly can only ever pick up what is new.
 *
 * The admin button on the Costs tab calls the same code for "I just logged
 * hours and want the number now".
 */

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?dry=1 reports without writing — for checking what tonight would do.
  if (new URL(req.url).searchParams.get("dry") === "1") {
    const { costs, skipped } = await planHoursCosts(createAdminClient());
    return NextResponse.json({
      dryRun: true,
      lines: costs.length,
      total: Math.round(costs.reduce((s, c) => s + c.estimated_amount, 0) * 100) / 100,
      skipped,
    });
  }

  const result = await commitHoursCosts(createAdminClient());
  return NextResponse.json({ ok: true, ...result });
}
