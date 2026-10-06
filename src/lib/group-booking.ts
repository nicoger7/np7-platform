import "server-only";
import { effectiveAddonStatus } from "@/lib/addons";
import { sumReceived, type PaymentLike } from "@/lib/payment-totals";

/**
 * Group bookings, phase 1: one payer covers several travellers.
 *
 * A covered booking keeps its own agreed_price — the per-person figure the
 * edition P&L and the §25 UStG margin settlement need — but all MONEY runs
 * through the payer's booking: its invoices and payment plan sum the whole
 * group, the covered booking is never invoiced or payment-chased itself, and
 * its portal shows "Nothing to pay here" instead of a plan. Model A from
 * docs/group-bookings.md, confirmed 2026-08-31.
 */

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type CoveredBooking = { id: string; guestName: string | null; total: number };

/** The bookings this payer covers, each with its own price + confirmed add-ons. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCoveredBookings(db: any, payerBookingId: string): Promise<CoveredBooking[]> {
  const { data: covered } = await db
    .from("exp_bookings")
    .select("id, agreed_price, contacts(name)")
    .eq("covered_by_booking_id", payerBookingId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (covered ?? []) as any[];
  if (!rows.length) return [];
  const ids = rows.map((b) => b.id);
  const { data: extras } = await db
    .from("exp_booking_addons")
    .select("booking_id, price, status, notes, payment_mode")
    .in("booking_id", ids);
  const addonsBy = new Map<string, number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const a of (extras ?? []) as any[]) {
    if (effectiveAddonStatus(a) !== "confirmed" || a.payment_mode === "direct") continue;
    addonsBy.set(a.booking_id, (addonsBy.get(a.booking_id) ?? 0) + (Number(a.price) || 0));
  }
  return rows.map((b) => ({
    id: b.id,
    guestName: b.contacts?.name ?? null,
    total: r2((Number(b.agreed_price) || 0) + (addonsBy.get(b.id) ?? 0)),
  }));
}

/** What the payer's invoices/plan must add on top of their own trip:
    Σ (covered agreed_price + covered confirmed add-ons). 0 for non-payers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function coveredExtraTotal(db: any, payerBookingId: string): Promise<number> {
  const covered = await getCoveredBookings(db, payerBookingId);
  return r2(covered.reduce((s, c) => s + c.total, 0));
}

/**
 * Money already sitting on the bookings this payer covers.
 *
 * The group's MONEY runs through the payer, but the team sometimes moves part
 * of a payment onto a companion's booking ("alloc" rows) so each traveller's
 * own revenue shows for the P&L. Every place that measured a payer against the
 * whole group's price then counted only the payer's own ledger, so the moved
 * money vanished: Jana Heinen, Tim Cederquist and Wilfred Wagt were fully paid
 * and their trip pages showed EUR 2,990, 7,280 and 2,390 still open, with a Pay
 * button for it (Nico, 6 Oct 2026: "something wrong with jana for bonaire").
 *
 * So wherever a payer's price includes what they cover, their money must
 * include what sits on those bookings too: the price and the money are pooled
 * the same way. Throws on a failed read, because "nothing is there" and "we
 * could not look" must not come out as the same number.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function coveredReceivedTotal(db: any, payerBookingId: string): Promise<number> {
  const { data: covered, error } = await db
    .from("exp_bookings").select("id").eq("covered_by_booking_id", payerBookingId);
  if (error) throw new Error(error.message ?? String(error));
  const ids = ((covered ?? []) as { id: string }[]).map((c) => c.id);
  if (!ids.length) return 0;
  const { data: pays, error: payErr } = await db
    .from("exp_payments").select("amount, direction, type, status, received_at, date, created_at").in("booking_id", ids);
  if (payErr) throw new Error(payErr.message ?? String(payErr));
  return sumReceived((pays ?? []) as PaymentLike[]);
}

/** Who pays for a covered booking — null when it pays for itself. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getCoverer(db: any, bookingId: string): Promise<{ bookingId: string; payerName: string | null } | null> {
  const { data: b } = await db
    .from("exp_bookings").select("covered_by_booking_id").eq("id", bookingId).maybeSingle();
  const payerId = b?.covered_by_booking_id;
  if (!payerId) return null;
  const { data: payer } = await db
    .from("exp_bookings").select("id, contacts(name)").eq("id", payerId).maybeSingle();
  return { bookingId: payerId, payerName: payer?.contacts?.name ?? null };
}
