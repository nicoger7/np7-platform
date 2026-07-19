import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { eventPricing } from "@/lib/events";
import { refundPaymentIntent, stripeConfigured, eur } from "@/lib/stripe";
import { sendEmail } from "@/lib/email/send";

/**
 * Confirm ONE candidate date for a standby event. This settles every deposit:
 *   - riders who marked the confirmed date  → emailed a "pay your balance" link.
 *   - riders who could NOT make it          → refunded event_refund_pct of the
 *     ticket (we keep the rest for fees), booking marked lost.
 * Idempotent-ish: only acts on deposit-paid bookings still in 'reserved'.
 */
const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(request: NextRequest) {
  const access = await getRequestAccess();
  if (!access) return bad("Not authorised.", 401);

  let experienceId: string | undefined, dateId: string | undefined;
  try { ({ experienceId, dateId } = await request.json()); } catch { return bad("Invalid request"); }
  if (!experienceId || !dateId) return bad("Missing event or date.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: exp } = await db
    .from("exp_experiences").select("id,title,slug,currency,event_deposit_pct,event_refund_pct,page_template")
    .eq("id", experienceId).maybeSingle();
  if (!exp || exp.page_template !== "event") return bad("Not an event.", 409);

  const { data: theDate } = await db.from("exp_event_dates").select("id,experience_id").eq("id", dateId).maybeSingle();
  if (!theDate || theDate.experience_id !== experienceId) return bad("Date not found.", 404);

  // Confirm this date, cancel the rest.
  await db.from("exp_event_dates").update({ status: "confirmed" }).eq("id", dateId);
  await db.from("exp_event_dates").update({ status: "cancelled" }).eq("experience_id", experienceId).neq("id", dateId).eq("status", "candidate");

  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
  const cur = exp.currency ?? "EUR";

  // Deposit-paid standby bookings awaiting resolution.
  const { data: bookings } = await db
    .from("exp_bookings")
    .select("id, agreed_price, event_date_ids, stripe_payment_intent, contact_id, downpayment_received, status, contacts(name,email)")
    .eq("experience_id", experienceId).eq("downpayment_received", true).eq("status", "reserved");

  let toPayBalance = 0, refunded = 0, refundErrors = 0;

  for (const b of (bookings ?? [])) {
    const canMake = Array.isArray(b.event_date_ids) && b.event_date_ids.includes(dateId);
    const firstName: string | undefined = (b.contacts?.name ?? "").split(" ")[0] || undefined;
    const price = Number(b.agreed_price) || 0;
    const { balance, refund } = eventPricing(price, exp.event_deposit_pct ?? 20, exp.event_refund_pct ?? 15);

    if (canMake) {
      toPayBalance++;
      await sendEmail({
        to: b.contacts?.email, templateKey: "event_date_confirmed_balance",
        vars: { firstName, experienceTitle: exp.title, balance: eur(balance, cur), balanceLink: `${origin}/experience/${exp.slug}/balance?booking=${b.id}` },
        bookingId: b.id, contactId: b.contact_id, dedupeKey: `event_balance_due:${b.id}:${dateId}`,
      }).catch(() => {});
    } else {
      // Refund event_refund_pct of the ticket on the deposit's PaymentIntent.
      let refundOk = false;
      if (stripeConfigured() && b.stripe_payment_intent && refund > 0) {
        const r = await refundPaymentIntent(b.stripe_payment_intent, Math.round(refund * 100));
        refundOk = r.ok;
        if (r.ok) {
          await db.from("exp_payments").insert({
            booking_id: b.id, contact_id: b.contact_id, experience_id: experienceId,
            amount: -refund, type: "refund", method: "stripe", direction: "revenue", status: "paid",
            reference: r.id, received_at: new Date().toISOString(),
            notes: `Standby refund (${exp.event_refund_pct ?? 15}% of ${eur(price, cur)}); date not chosen`,
          }).then(undefined, () => {});
        } else refundErrors++;
      }
      refunded++;
      await db.from("exp_bookings").update({
        status: "lost",
        notes: `Standby — chosen date(s) didn't run. ${refundOk ? `Refunded ${eur(refund, cur)}.` : "Refund pending (manual)."}`,
        updated_at: new Date().toISOString(),
      }).eq("id", b.id);
      await sendEmail({
        to: b.contacts?.email, templateKey: "event_date_not_running",
        vars: { firstName, experienceTitle: exp.title, refund: eur(refund, cur) },
        bookingId: b.id, contactId: b.contact_id, dedupeKey: `event_not_running:${b.id}:${dateId}`,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, confirmed: dateId, toPayBalance, refunded, refundErrors });
}
