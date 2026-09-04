import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { dbErrorMessage } from "@/lib/admin-errors";
import { getRequestAccess, requireAdminGate } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { sumReceived, sumExpected, paidState } from "@/lib/payment-totals";
/** Null out the money fields on a booking for roles that can't see prices/payments. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function redactMoney<T extends Record<string, any>>(b: T): T {
  return { ...b, agreed_price: null, deposit: null, total_paid: null, outstanding: null, package: b.package ? { ...b.package, price: null } : b.package, money_redacted: true };
}

// GET /api/admin/bookings — list bookings with related data
export async function GET(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const { searchParams } = new URL(request.url);

  const experienceId = searchParams.get("experience_id");
  const editionId = searchParams.get("edition_id");
  const contactId = searchParams.get("contact_id");
  const status = searchParams.get("status");

  let query = client
    .from("exp_bookings")
    .select(
      `*,
       contact:contact_id(id, name, email, phone, tshirt_size, level, country),
       experience:experience_id(id, title, slug, location),
       edition:edition_id(id, year, label, date_end),
       package:package_id(id, name, price)`
    )
    .order("created_at", { ascending: false });

  if (experienceId) {
    query = query.eq("experience_id", experienceId);
  }
  if (editionId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).eq("edition_id", editionId);
  }
  if (contactId) {
    query = query.eq("contact_id", contactId);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Calculate payment info per booking
  const bookingIds = (data || []).map((b) => b.id);
  let payments: Record<string, number> = {};
  const pendingByBooking: Record<string, number> = {};

  if (bookingIds.length > 0) {
    const { data: paymentData } = await client
      .from("exp_payments")
      .select("booking_id, amount, direction, type, status")
      .in("booking_id", bookingIds);

    if (paymentData) {
      // group first, then total through the one shared rule — a pending or
      // cancelled row is not money in the bank (see lib/payment-totals)
      const byBooking = new Map<string, typeof paymentData>();
      for (const p of paymentData) {
        if (!p.booking_id) continue;
        byBooking.set(p.booking_id, [...(byBooking.get(p.booking_id) ?? []), p]);
      }
      for (const [bid, rows] of byBooking) {
        payments[bid] = sumReceived(rows);
        pendingByBooking[bid] = sumExpected(rows);
      }
    }
  }

  let bookings = (data || []).map((b) => ({
    ...b,
    total_paid: payments[b.id] || 0,
    total_pending: pendingByBooking[b.id] || 0,
    // the ✓ / ½ / — indicator, derived from the ledger rather than the two
    // hand-ticked booleans nobody kept in sync after the Notion import
    paid_state: paidState(payments[b.id] || 0, b.agreed_price),
    outstanding: b.agreed_price
      ? Math.max(0, Number(b.agreed_price) - (payments[b.id] || 0))
      : 0,
  }));

  // Field redaction: roles without "money" don't get prices/payments at all.
  const access = await getRequestAccess();
  // Redact unless the caller is proven allowed. `access &&` did the
  // opposite: an unidentified caller saw the unredacted rows.
  if (!access || !effectiveCanSeeField(access, "money")) bookings = bookings.map(redactMoney);

  return NextResponse.json({ bookings });
}

// POST /api/admin/bookings — create a booking
export async function POST(request: NextRequest) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const client = createAdminClient();
  const body = await request.json();

  /*
   * A booking is a person on a trip — refuse the ones that are neither.
   *
   * This route inserted the request body verbatim. The New Booking form does
   * require an experience and a guest, but the route is the only thing standing
   * between a mistyped script and the bookings table, and it stood aside: a
   * walkthrough created a guest-less booking and a EUR -500 one, both accepted.
   * A booking with no guest can never be invoiced, mailed or housed; a negative
   * price silently subtracts from an edition's P&L.
   */
  if (!body?.experience_id) {
    return NextResponse.json({ error: "Choose an experience for this booking." }, { status: 400 });
  }
  if (!body?.contact_id) {
    return NextResponse.json({ error: "A booking needs a guest — pick or create a contact first." }, { status: 400 });
  }
  if (body.agreed_price != null && Number(body.agreed_price) < 0) {
    return NextResponse.json({ error: "The price can't be negative. Use a payment or a credit note to give money back." }, { status: 400 });
  }
  // A week belongs to one experience; crossing them makes a booking whose
  // dates, packages and rooms all contradict each other.
  if (body.edition_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ed } = await (client as any)
      .from("exp_editions").select("experience_id").eq("id", body.edition_id).maybeSingle();
    if (!ed) return NextResponse.json({ error: "That week doesn't exist (any more) — pick it again." }, { status: 400 });
    if (ed.experience_id !== body.experience_id) {
      return NextResponse.json({ error: "That week belongs to a different experience — pick a week of the chosen experience." }, { status: 400 });
    }
  }

  const { data, error } = await client
    .from("exp_bookings")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: dbErrorMessage(error, "Couldn't create the booking — please try again.") }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
