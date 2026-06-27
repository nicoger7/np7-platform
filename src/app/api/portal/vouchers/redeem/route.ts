import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { getBookingPaid, getConfirmedAddonsTotal } from "@/lib/portal-data";
import { fmtVoucherMoney } from "@/lib/vouchers";

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmtMoney = (n: number, currency: string | null) => fmtVoucherMoney(n, currency || "EUR");

/**
 * Redeem a gift voucher against one of the member's own bookings. The code is a
 * bearer token — whoever holds it can apply it — but only to a booking for the
 * SAME experience the voucher was bought for, and only an active (team-confirmed,
 * not expired) voucher. On success the voucher amount is logged as a payment on
 * the booking (so the payment plan credits it) and the voucher is marked redeemed
 * and claimed by the redeeming member.
 */
export async function POST(req: Request) {
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);
  if (!user) return NextResponse.json({ error: "Please sign in to redeem a voucher." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
  if (!code) return NextResponse.json({ error: "Enter your voucher code." }, { status: 400 });
  if (!bookingId) return NextResponse.json({ error: "Missing booking." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // The booking must belong to this member.
  const { data: booking } = await db
    .from("exp_bookings")
    .select("id, contact_id, experience_id, agreed_price")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking || booking.contact_id !== user.contactId) {
    return NextResponse.json({ error: "We couldn't find that booking on your account." }, { status: 404 });
  }

  // The voucher must exist and be ready to use.
  const { data: voucher } = await db
    .from("gift_vouchers")
    .select("id, status, amount, currency, experience_id, redeem_by, recipient_contact_id")
    .eq("code", code)
    .maybeSingle();
  if (!voucher) return NextResponse.json({ error: "That voucher code isn't valid." }, { status: 404 });

  if (voucher.status === "redeemed") {
    return NextResponse.json({ error: "This voucher has already been redeemed." }, { status: 409 });
  }
  if (voucher.status !== "active") {
    return NextResponse.json(
      { error: "This voucher isn't ready to use yet. It activates once payment is confirmed." },
      { status: 409 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  if (voucher.redeem_by && voucher.redeem_by < today) {
    // Lazily flip an over-due voucher to expired so it stops showing as usable.
    await db.from("gift_vouchers").update({ status: "expired" }).eq("id", voucher.id);
    return NextResponse.json({ error: "This voucher has expired." }, { status: 409 });
  }

  // It must be for THIS trip's experience.
  if (voucher.experience_id && booking.experience_id && voucher.experience_id !== booking.experience_id) {
    return NextResponse.json(
      { error: "This voucher is for a different experience and can't be applied to this trip." },
      { status: 409 }
    );
  }

  const amount = Number(voucher.amount) || 0;
  if (amount <= 0) {
    return NextResponse.json({ error: "This voucher has no value to apply." }, { status: 409 });
  }

  // Cap the credit at what's still owed: the voucher's value can't exceed the
  // booking's outstanding balance. Any surplus "falls through" — it isn't kept as
  // a residual credit; the voucher is simply marked fully redeemed.
  const [addonsTotal, paid] = await Promise.all([
    getConfirmedAddonsTotal(bookingId).catch(() => 0),
    getBookingPaid(bookingId).catch(() => 0),
  ]);
  const total = round((Number(booking.agreed_price) || 0) + addonsTotal);
  const outstanding = total > 0 ? round(Math.max(0, total - paid)) : null;
  if (outstanding != null && outstanding <= 0) {
    return NextResponse.json(
      { error: "This trip is already fully paid — there's nothing left for the voucher to cover." },
      { status: 409 }
    );
  }
  // Unknown total (no agreed price yet) → apply the full value; otherwise cap it.
  const applied = outstanding == null ? amount : round(Math.min(amount, outstanding));
  const forfeited = round(Math.max(0, amount - applied));

  // Credit the booking. 'partial' is an always-allowed payment type, so this
  // works without a migration; method/reference record that it came from a voucher.
  const { error: payErr } = await db.from("exp_payments").insert({
    booking_id: bookingId,
    amount: applied,
    type: "partial",
    method: "voucher",
    reference: code,
    direction: "revenue",
    status: "paid",
    received_at: new Date().toISOString(),
    notes: forfeited > 0
      ? `Gift voucher ${code} redeemed (${fmtMoney(amount, voucher.currency)} voucher; ${fmtMoney(applied, voucher.currency)} applied, ${fmtMoney(forfeited, voucher.currency)} surplus not carried over)`
      : `Gift voucher ${code} redeemed`,
  });
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 400 });

  // Mark the voucher redeemed + claim it for the redeeming member.
  const { error: vErr } = await db
    .from("gift_vouchers")
    .update({
      status: "redeemed",
      redeemed_booking_id: bookingId,
      redeemed_at: new Date().toISOString(),
      recipient_contact_id: voucher.recipient_contact_id ?? user.contactId,
    })
    .eq("id", voucher.id)
    .eq("status", "active"); // guard against a double redeem race
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, amount: applied, voucherValue: amount, forfeited, currency: voucher.currency || "EUR" });
}
