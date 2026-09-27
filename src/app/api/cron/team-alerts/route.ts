import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "@/lib/cron-auth";
import { sweepNewBookings, sweepAddonRequests, sweepInterestSignups, type SweepResult } from "@/lib/email/team-alerts";
import {
  sweepPayments, sweepGuestRequests, sweepCancellationRequests, sweepWiderrufe,
  sweepAccountSignups, sweepSignatureApplications, sweepReviews, SIGNATURE_LOOKBACK_MS,
} from "@/lib/email/team-alerts-guests";
import { sweepHwOrders, sweepHwReturns, sweepHwEnquiries } from "@/lib/email/team-alerts-hardware";

/**
 * Tell NP7 about the bookings that came in, and everything else a guest does
 * that somebody has to act on.
 *
 * Its own cron rather than a line in the daily email job, because that one runs
 * once at 09:00 and a booking alert that can be twenty hours old is not an
 * alert. This runs every quarter hour and, on the ordinary run where nothing
 * has come in, is one indexed query per event and a return. An event nobody is
 * subscribed to does not even query.
 *
 * Safe to run twice: every send is deduped on the event + recipient, so an
 * overlapping run announces nothing a second time.
 *
 * A failed or short bank transfer is not here: Stripe tells the webhook, and
 * the webhook tells the team directly (announceTransferProblem).
 */
export const dynamic = "force-dynamic";
// More sweeps than before (Nico, 28 Sep 2026). A quiet run is still well under
// a second; the headroom is for a burst of sends after a campaign.
export const maxDuration = 60;

/** One sweep that throws must not take the others' results with it. */
const safe = (p: Promise<SweepResult>): Promise<SweepResult | { error: string }> =>
  p.catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A six-hour window, not fifteen minutes: a run that fails or is skipped must
  // not lose the bookings it would have covered. The dedupe key stops the
  // overlap turning into repeats.
  const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  // A Signature application only counts once its email is confirmed, and that
  // click can come a day later. There is no "verified at", so it looks back a
  // week on created_at and the dedupe key does the rest.
  const signatureSince = new Date(Date.now() - SIGNATURE_LOOKBACK_MS).toISOString();
  const [
    bookings, addons, waitlist,
    payments, requests, cancellations, widerrufe, signups, signature, reviews,
    hwOrders, hwReturns, hwEnquiries,
  ] = await Promise.all([
    safe(sweepNewBookings({ since })),
    safe(sweepAddonRequests({ since })),
    safe(sweepInterestSignups({ since })),
    safe(sweepPayments({ since })),
    safe(sweepGuestRequests({ since })),
    safe(sweepCancellationRequests({ since })),
    safe(sweepWiderrufe({ since })),
    safe(sweepAccountSignups({ since })),
    safe(sweepSignatureApplications({ since: signatureSince })),
    safe(sweepReviews({ since })),
    safe(sweepHwOrders({ since })),
    safe(sweepHwReturns({ since })),
    safe(sweepHwEnquiries({ since })),
  ]);
  return NextResponse.json({
    ok: true, bookings, addons, waitlist,
    payments, requests, cancellations, widerrufe, signups, signature, reviews,
    hwOrders, hwReturns, hwEnquiries,
  });
}
