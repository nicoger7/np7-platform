import "server-only";
import { sumReceived } from "@/lib/payment-totals";
import { effectiveAddonStatus } from "@/lib/addons";
import { coveredExtraTotal } from "@/lib/group-booking";

/**
 * Bring a booking's money flags and status up to what has actually been paid.
 *
 * The rule lived inside the Stripe webhook alone, so it only ran when a guest
 * paid through Stripe. Money that arrived any other way, and most of it does,
 * from the bank feed, an off-bank record, a row typed in admin, moved the
 * ledger and nothing else: Indrek Orro was settled to the cent, his final
 * invoice PAID, and his booking still read "Confirmed" (Nico, 19 Sep 2026:
 * "what is the status still good for? it doesn't change according to the
 * received money"). That matters beyond tidiness: status decides the funnel,
 * who counts as secured for the mailing, how many spots a week has left and
 * what the member's own page says.
 *
 * So the rule is here now, one copy, called after every change to the money.
 *
 * WHAT IT WILL NOT DO
 *  · never reopens a cancelled or lost booking: money landing on one is a
 *    refund decision for a human (§651h), not a status change.
 *  · never moves attended back to paid, and never downgrades. Flags come off
 *    only when the money genuinely went away (a payment deleted or refunded),
 *    and then the status is left where a human put it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const SECURED_FROM = ["lead", "reserved", "payment_pending"];

export type MoneyStatusResult = {
  received: number;
  total: number;
  changed: Record<string, unknown> | null;
};

export async function syncBookingMoneyStatus(db: Db, bookingId: string): Promise<MoneyStatusResult | null> {
  const { data: booking } = await db
    .from("exp_bookings")
    .select("id, status, agreed_price, deposit_received, downpayment_received, final_payment_received, covered_by_booking_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return null;

  const [{ data: pays }, { data: extras }] = await Promise.all([
    db.from("exp_payments").select("amount, direction, type, status, received_at, date, created_at").eq("booking_id", bookingId),
    db.from("exp_booking_addons").select("price, status, notes, payment_mode").eq("booking_id", bookingId),
  ]);

  const addons = ((extras ?? []) as { price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null }[])
    .filter((a) => effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
    .reduce((n, a) => n + (Number(a.price) || 0), 0);
  // A payer carries their group: their own price plus everyone they cover.
  // Without this a payer who settled only their own share would be flagged
  // "paid in full" while the group's balance was still open.
  const covered = booking.covered_by_booking_id ? 0 : await coveredExtraTotal(db, bookingId).catch(() => 0);
  const received = sumReceived((pays ?? []) as Parameters<typeof sumReceived>[0]);
  const total = (Number(booking.agreed_price) || 0) + addons + covered;

  const status = String(booking.status ?? "").toLowerCase();
  const patch: Record<string, unknown> = {};

  // Nothing decided about a booking that is over. Money on one is a human's call.
  if (status === "cancelled" || status === "lost") return { received, total, changed: null };

  const securedNow = total > 0 && received > 0.01;
  const fullyPaid = total > 0 && received + 0.01 >= total;

  if (securedNow && !booking.downpayment_received) patch.downpayment_received = true;
  if (securedNow && SECURED_FROM.includes(status)) patch.status = "confirmed";

  if (fullyPaid) {
    if (!booking.final_payment_received) patch.final_payment_received = true;
    if ([...SECURED_FROM, "confirmed"].includes(status)) patch.status = "paid";
  } else {
    // The money went away again (a payment deleted, or a refund recorded), so
    // the flag has to go with it. The status stays: whether that booking is
    // still confirmed is for whoever handled the refund to say.
    if (booking.final_payment_received) patch.final_payment_received = false;
    if (!securedNow && booking.downpayment_received) patch.downpayment_received = false;
  }

  if (!Object.keys(patch).length) return { received, total, changed: null };
  patch.updated_at = new Date().toISOString();
  const { error } = await db.from("exp_bookings").update(patch).eq("id", bookingId);
  if (error) throw new Error(`booking ${bookingId}: ${error.message ?? error}`);
  return { received, total, changed: patch };
}

/** Same, for several bookings, e.g. both sides of an allocation. Never throws. */
export async function syncBookingsMoneyStatus(db: Db, ids: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  await Promise.all(unique.map((id) =>
    syncBookingMoneyStatus(db, id).catch((e) =>
      console.error("[money-status]", id, e instanceof Error ? e.message : e)),
  ));
}
