import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { createCheckoutSession, eur } from "@/lib/stripe";
import { outstandingForBooking } from "@/lib/events";
import { publicOrigin } from "@/lib/public-origin";
import { rateLimited, LIMITS } from "@/lib/rate-limit";
/**
 * "Pay what is still owed on this ticket" — whether that is a balance after a
 * deposit or the whole ticket because nothing has been paid yet.
 *
 * Reached from the "pay your balance" email link (the booking id is the token)
 * AND from the member area's Payment tab, which links here for any event
 * booking that is not settled. That second door is why the deposit gate had to
 * go: it refused every booking with nothing paid on it — a €750 clinic ticket
 * bought as a lead, or an unpaid seat entered by hand — while the page that
 * links here was already showing a Pay button for exactly that amount. The
 * page offered a payment the till would not take.
 *
 * What is charged is always the same number, `outstanding`; only the KIND the
 * webhook records changes, because a payment that covers the entire ticket is
 * a full ticket (deposit + final, invoiced as a final invoice) and not a
 * balance against a deposit that never existed.
 *
 * Idempotent-guarded against double-payment.
 */
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

/** Where the payer came from, kept only when it is one of our own member
 *  pages. Never a host and never protocol-relative, so it cannot be used to
 *  bounce a buyer off-site from a Stripe cancel. */
function memberReturn(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/account/") || raw.startsWith("//")) return null;
  return raw.slice(0, 200);
}

export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "event-balance", policy: LIMITS.signup });
  if (tooMany) return tooMany;

  let bookingId: string | undefined;
  let from: string | null = null;
  try {
    const body = await request.json();
    bookingId = body?.bookingId;
    from = memberReturn(body?.from);
  } catch { return bad("Invalid request"); }
  if (!bookingId) return bad("Missing booking.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: b } = await db
    .from("exp_bookings")
    .select("id, agreed_price, status, downpayment_received, final_payment_received, event_date_ids, contact_id, experience_id, exp_experiences(title,slug,currency,event_deposit_pct,event_refund_pct,page_template)")
    .eq("id", bookingId).maybeSingle();
  if (!b || b.exp_experiences?.page_template !== "event") return bad("Booking not found.", 404);
  if (b.final_payment_received) return bad("This balance is already paid.", 409);

  const { data: contact } = await db.from("contacts").select("email").eq("id", b.contact_id).maybeSingle();
  const price = Number(b.agreed_price) || 0;
  const { paid, outstanding } = await outstandingForBooking(db, bookingId, price);
  if (outstanding <= 0) return bad("Nothing left to pay.", 409);

  /*
   * Nothing received yet → this charge IS the ticket. `event_full` is the kind
   * the webhook already understands for that: it sets the downpayment and the
   * final flag, moves the booking to 'paid' and issues a final invoice. Sending
   * `event_balance` instead would leave a fully paid booking with
   * downpayment_received still false, which is the state that started all this.
   */
  const payingInFull = paid <= 0;
  const kind = payingInFull ? "event_full" : "event_balance";

  // A member paying from their own booking goes back to their own booking, not
  // to the sales page they never came from.
  const member = await getPortalUser({ allowPreview: false }).catch(() => null);
  const mine = !!member?.contactId && member.contactId === b.contact_id;
  const back = mine ? `/account/bookings/${bookingId}` : from;

  const origin = publicOrigin();
  const cur = b.exp_experiences.currency ?? "EUR";
  const session = await createCheckoutSession({
    line: {
      name: `${b.exp_experiences.title} · ${payingInFull ? "ticket" : "balance"}`,
      description: payingInFull ? "Event ticket." : `Remaining balance on your ${eur(price, cur)} ticket.`,
      amountCents: Math.round(outstanding * 100),
    },
    currency: cur,
    successUrl: back
      ? `${origin}${back}#payment`
      : `${origin}/experience/${b.exp_experiences.slug}?paid=1`,
    cancelUrl: `${origin}/experience/${b.exp_experiences.slug}/balance?booking=${bookingId}${from ? `&from=${encodeURIComponent(from)}` : ""}`,
    customerEmail: contact?.email ?? undefined,
    metadata: { booking_id: bookingId, kind, experience_id: b.experience_id },
    paymentIntentDescription: `NP7 event ${payingInFull ? "ticket" : "balance"} · booking ${bookingId}`,
  });
  if (!session) return bad("Payment isn’t available right now. Please contact us.", 503);
  return NextResponse.json({ url: session.url, amount: eur(outstanding, cur) });
}
