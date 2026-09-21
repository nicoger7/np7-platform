import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { sweepNewBookings } from "@/lib/email/team-alerts";

/**
 * Tell NP7 about the bookings that came in.
 *
 * Its own cron rather than a line in the daily email job, because that one runs
 * once at 09:00 and a booking alert that can be twenty hours old is not an
 * alert. This runs every quarter hour and, on the ordinary run where nothing
 * has come in, is one indexed query and a return.
 *
 * Safe to run twice: every send is deduped on booking + recipient, so an
 * overlapping run announces nothing a second time.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A six-hour window, not fifteen minutes: a run that fails or is skipped must
  // not lose the bookings it would have covered. The dedupe key stops the
  // overlap turning into repeats.
  const res = await sweepNewBookings({ since: new Date(Date.now() - 6 * 3600 * 1000).toISOString() });
  return NextResponse.json({ ok: true, ...res });
}
