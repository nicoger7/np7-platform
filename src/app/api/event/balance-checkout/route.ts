import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { createCheckoutSession, eur } from "@/lib/stripe";
import { outstandingForBooking } from "@/lib/events";
import { publicOrigin } from "@/lib/public-origin";
import { rateLimited, LIMITS } from "@/lib/rate-limit";
/**
 * Standby balance checkout — the buyer pays the remaining amount once their date
 * is confirmed. Reached from the "pay your balance" email link (the booking id
 * is the token). Idempotent-guarded against double-payment.
 */
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "event-balance", policy: LIMITS.signup });
  if (tooMany) return tooMany;

  let bookingId: string | undefined;
  try { bookingId = (await request.json())?.bookingId; } catch { return bad("Invalid request"); }
  if (!bookingId) return bad("Missing booking.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: b } = await db
    .from("exp_bookings")
    .select("id, agreed_price, status, downpayment_received, final_payment_received, event_date_ids, contact_id, experience_id, exp_experiences(title,slug,currency,event_deposit_pct,event_refund_pct,page_template)")
    .eq("id", bookingId).maybeSingle();
  if (!b || b.exp_experiences?.page_template !== "event") return bad("Booking not found.", 404);
  if (b.final_payment_received) return bad("This balance is already paid.", 409);
  if (!b.downpayment_received) return bad("No deposit on this booking yet.", 409);

  const { data: contact } = await db.from("contacts").select("email").eq("id", b.contact_id).maybeSingle();
  const price = Number(b.agreed_price) || 0;
  const { balance } = await outstandingForBooking(db, bookingId, price).then((r) => ({ balance: r.outstanding }));
  if (balance <= 0) return bad("Nothing left to pay.", 409);

  const origin = publicOrigin();
  const cur = b.exp_experiences.currency ?? "EUR";
  const session = await createCheckoutSession({
    line: { name: `${b.exp_experiences.title} · balance`, description: `Remaining balance on your ${eur(price, cur)} ticket.`, amountCents: Math.round(balance * 100) },
    currency: cur,
    successUrl: `${origin}/experience/${b.exp_experiences.slug}?paid=1`,
    cancelUrl: `${origin}/experience/${b.exp_experiences.slug}/balance?booking=${bookingId}`,
    customerEmail: contact?.email ?? undefined,
    metadata: { booking_id: bookingId, kind: "event_balance", experience_id: b.experience_id },
    paymentIntentDescription: `NP7 event balance · booking ${bookingId}`,
  });
  if (!session) return bad("Payment isn’t available right now. Please contact us.", 503);
  return NextResponse.json({ url: session.url, amount: eur(balance, cur) });
}
