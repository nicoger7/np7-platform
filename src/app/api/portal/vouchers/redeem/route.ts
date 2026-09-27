import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { getBookingPaid, getConfirmedAddonsTotal } from "@/lib/portal-data";
import { fmtVoucherValue, splitVoucherCredit, voucherPaymentRow, voucherValueLeft } from "@/lib/vouchers";

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Use a gift voucher on one of the member's own bookings. The code is a bearer
 * token (whoever holds it can apply it), but only to a booking for the SAME
 * experience the voucher was bought for, and only while it is active
 * (team-confirmed, not expired).
 *
 * WHAT IS LEFT STAYS ON THE VOUCHER (Nico, 27 Sep 2026)
 *
 * The credit is capped at what the booking still owes. Anything above that
 * used to be lost: the voucher was marked redeemed and a €10,000 gift used on a
 * €2,390 week threw away €7,610. Now the rest is written to
 * gift_vouchers.balance (migration 262) and the voucher stays active, so the
 * same code works on the next booking. It becomes 'redeemed' only when it is
 * used up. redeemed_booking_id and redeemed_at name the latest use, and every
 * use is also a line in the voucher's notes and its own payment row.
 *
 * ORDER OF WRITES
 *
 * The voucher is claimed first, the payment written second. The claim is a
 * compare-and-set on status AND balance, so two tabs applying the same code at
 * the same moment cannot both spend the same euros: the second finds the
 * balance already moved and is told to look again. If the payment then fails
 * to write, the claim is put back (only while it is still this claim), so a
 * failure never eats voucher value.
 *
 * A booking with no price yet is refused: there is nothing to cap against.
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

  // The voucher must exist and be ready to use. `*` rather than a column list,
  // so the lookup itself still works on a database without the balance column.
  const { data: voucher } = await db
    .from("gift_vouchers")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!voucher) return NextResponse.json({ error: "That voucher code isn't valid." }, { status: 404 });

  if (voucher.status === "redeemed") {
    return NextResponse.json({ error: "This voucher has been used up." }, { status: 409 });
  }
  if (voucher.status !== "active") {
    return NextResponse.json(
      { error: "This voucher isn't ready to use yet. It activates once payment is confirmed." },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
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

  const valueLeft = voucherValueLeft(voucher);
  if (valueLeft <= 0) {
    return NextResponse.json({ error: "This voucher has nothing left on it." }, { status: 409 });
  }

  const [addonsTotal, paid] = await Promise.all([
    getConfirmedAddonsTotal(bookingId).catch(() => 0),
    getBookingPaid(bookingId).catch(() => 0),
  ]);
  const total = round((Number(booking.agreed_price) || 0) + addonsTotal);
  const outstanding = total > 0 ? round(Math.max(0, total - paid)) : null;
  /* No price yet, no voucher (review, 27 Sep 2026). With nothing to cap
     against, the whole voucher used to go on the booking and the voucher was
     marked used up, so a €10,000 gift on an unpriced booking lost everything
     above the trip's eventual price. Asking again once the price is set costs
     the guest one click; the old way cost them the remainder. */
  if (outstanding == null) {
    return NextResponse.json(
      { error: "This trip doesn't have a price yet, so the voucher can't be applied. Try again once your price is confirmed." },
      { status: 409 }
    );
  }
  if (outstanding <= 0) {
    return NextResponse.json(
      { error: "This trip is already fully paid. There's nothing left for the voucher to cover." },
      { status: 409 }
    );
  }

  const currency: string = voucher.currency || "EUR";
  const { applied, left, status } = splitVoucherCredit(valueLeft, outstanding);
  const money = (n: number) => fmtVoucherValue(n, currency);
  const useLine = `${today} · ${money(applied)} used on booking ${bookingId}${left > 0 ? ` · ${money(left)} left` : " · used up"}`;

  // 1. Claim the value: only if nobody else moved it since we read it.
  let claim = db
    .from("gift_vouchers")
    .update({
      status,
      balance: left,
      redeemed_booking_id: bookingId,
      redeemed_at: now,
      recipient_contact_id: voucher.recipient_contact_id ?? user.contactId,
      notes: [voucher.notes, useLine].filter(Boolean).join("\n"),
    })
    .eq("id", voucher.id)
    .eq("status", "active");
  claim = voucher.balance == null ? claim.is("balance", null) : claim.eq("balance", voucher.balance);
  const { data: claimed, error: vErr } = await claim.select("id");
  if (vErr) {
    return NextResponse.json({ error: "We couldn't apply your voucher just now. Please try again in a moment." }, { status: 500 });
  }
  if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) {
    return NextResponse.json(
      { error: "This voucher was just used on another booking. Reload the page to see what is left on it." },
      { status: 409 }
    );
  }

  // 2. Credit the booking. 'partial' is an always-allowed payment type;
  // method/reference record that it came from a voucher, and provenance says
  // why no bank line will ever match it.
  const { error: payErr } = await db.from("exp_payments").insert(
    voucherPaymentRow({
      bookingId,
      contactId: booking.contact_id ?? null,
      experienceId: booking.experience_id ?? null,
      code,
      applied,
      valueBefore: valueLeft,
      left,
      currency,
      at: now,
    })
  );
  if (payErr) {
    /* Put the voucher back exactly as it was, so the failure costs nothing.
       Compare-and-set on THIS claim (review, 27 Sep 2026): if another request
       claimed the new balance and wrote its payment while our insert was
       failing, a blind restore would hand back euros that request already
       spent. The claim wrote redeemed_at = now and redeemed_booking_id =
       this booking; if either has moved on, the row is no longer ours to
       roll back, and it stays as the later claim left it. */
    await db
      .from("gift_vouchers")
      .update({
        status: "active",
        balance: voucher.balance ?? null,
        redeemed_booking_id: voucher.redeemed_booking_id ?? null,
        redeemed_at: voucher.redeemed_at ?? null,
        recipient_contact_id: voucher.recipient_contact_id ?? null,
        notes: voucher.notes ?? null,
      })
      .eq("id", voucher.id)
      .eq("redeemed_at", now)
      .eq("redeemed_booking_id", bookingId);
    return NextResponse.json({ error: payErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, amount: applied, voucherValue: valueLeft, left, currency });
}
