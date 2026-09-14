/**
 * /api/portal/bookings/[id]/pay — the member pays, with whatever suits them.
 *
 * Until now the portal's answer to "how do I pay?" was a bank transfer and the
 * details on an invoice. That works, and it stays the default, but it loses the
 * guest who would have paid in thirty seconds from their banking app, and it
 * loses NP7 the days between the reminder and the transfer.
 *
 * What it offers is deliberately narrow: the bank-rail methods only. A guest
 * approves in their own banking app, the money is irreversible, and it costs
 * cents rather than a percentage. iDEAL and Wero, Bancontact, EPS, BLIK and
 * Przelewy24, each shown by Stripe to the country that uses it.
 *
 * Card, Apple Pay, Link and Klarna are deliberately absent, and it is a money
 * decision rather than a legal one. A surcharge on a private EEA card is
 * forbidden (§270a BGB), so on a European guest NP7 would carry Stripe's
 * percentage itself: about €22 on a €1,440 down-payment, where iDEAL costs 29
 * cents. Klarna is worse again at 2.99 % and is consumer credit for a holiday.
 * A guest who genuinely needs a card asks, and gets the admin's link, where the
 * fee can be charged on the cards the law allows it on and the booking is
 * looked at by a person.
 *
 * The payment is recorded by the same webhook path as that link, through an
 * exp_payment_links row with a zero fee, so a payment made here is dedupe-safe,
 * tied to the Stripe credit in the bank feed, and settles its invoices.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { createCheckoutSession, expireCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { publicOrigin } from "@/lib/public-origin";
import { sumReceived } from "@/lib/payment-totals";
import { effectiveAddonStatus } from "@/lib/addons";

export const dynamic = "force-dynamic";

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // allowPreview: false — an admin looking at a member's portal must not be
  // able to start a payment in their name.
  const user = await getPortalUser({ allowPreview: false });
  if (!user) return bad("Unauthorized", 401);
  if (!stripeConfigured()) return bad("Paying online isn't available right now. Your invoice has our bank details.", 503);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db.from("exp_bookings")
    .select("id, contact_id, experience_id, agreed_price, status, covered_by_booking_id, contacts(email), exp_experiences(title,currency,page_template), exp_editions(label,currency)")
    .eq("id", id).maybeSingle();
  if (!booking || booking.contact_id !== user.contactId) return bad("Booking not found.", 404);
  if (booking.covered_by_booking_id) return bad("Someone else is paying for this booking.", 409);
  if (booking.status === "lost" || booking.status === "cancelled") return bad("This booking is closed.", 409);
  // A clinic ticket has its own checkout, which knows about deposits and dates.
  if (booking.exp_experiences?.page_template === "event") return bad("Use the ticket payment page for this booking.", 409);
  const currency = (booking.exp_editions?.currency as string | null) ?? (booking.exp_experiences?.currency as string | null) ?? "EUR";
  if (currency !== "EUR") return bad("Paying online is EUR only for now; your invoice has our bank details.", 409);

  // What is owed: the price plus the confirmed add-ons we bill, less what has
  // landed. The same rule the booking page and the admin's link both use.
  const [{ data: pays }, { data: extras }] = await Promise.all([
    db.from("exp_payments").select("amount, direction, type, status, received_at, date, created_at").eq("booking_id", id),
    db.from("exp_booking_addons").select("price, status, notes, payment_mode").eq("booking_id", id),
  ]);
  const addons = ((extras ?? []) as { price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null }[])
    .filter((a) => effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
    .reduce((n, a) => n + (Number(a.price) || 0), 0);
  const outstanding = r2((Number(booking.agreed_price) || 0) + addons - sumReceived(pays ?? []));
  if (outstanding <= 0.01) return bad("Nothing left to pay on this booking.", 409);

  // Part payments are allowed (the securing payment, then the balance), but
  // never more than is owed and never a token amount.
  const asked = body.amount != null ? r2(Number(body.amount)) : outstanding;
  if (!Number.isFinite(asked) || asked <= 0) return bad("That amount isn't a number.");
  if (asked > outstanding + 0.01) return bad("That is more than is owed on this booking.");
  if (asked < 1) return bad("That is too small to pay online.");

  // An open link for the same money would let the same balance be paid twice.
  const { data: open } = await db.from("exp_payment_links")
    .select("amount").eq("booking_id", id).eq("status", "open").gt("expires_at", new Date().toISOString());
  const spokenFor = r2(((open ?? []) as { amount: number }[]).reduce((n, l) => n + Number(l.amount), 0));
  if (asked > outstanding - spokenFor + 0.01) {
    return bad("A payment is already open on this booking. Finish that one, or come back in a few minutes.", 409);
  }

  const expiresAt = new Date(Date.now() + 2 * 3600 * 1000);
  const { data: link, error: insErr } = await db.from("exp_payment_links").insert({
    booking_id: id, contact_id: booking.contact_id,
    amount: asked, fee: 0, total: asked, currency, card_region: "eea",
    status: "open", note: "Paid by the member from their trip page", created_by: "member",
    expires_at: expiresAt.toISOString(),
  }).select("id").single();
  if (insErr || !link) return bad("Could not start the payment. Please try again.", 500);

  const origin = publicOrigin();
  const title = booking.exp_experiences?.title ?? "NP7 Experience";
  const edition = booking.exp_editions?.label ? ` · ${booking.exp_editions.label}` : "";
  let session: { url: string; id: string } | null = null;
  try {
    session = await createCheckoutSession({
      lines: [{
        name: `${title}${edition}`,
        description: asked >= outstanding - 0.01 ? "Everything still owed on your trip." : "Part payment on your trip.",
        amountCents: Math.round(asked * 100),
      }],
      currency,
      successUrl: `${origin}/account/bookings/${id}?paid=1#payment`,
      cancelUrl: `${origin}/account/bookings/${id}#payment`,
      customerEmail: booking.contacts?.email ?? undefined,
      // Named explicitly rather than left to Stripe's dynamic list: the cheap
      // rails only. Stripe still shows each guest just the ones their country
      // has, so a German sees Wero, a Dutch guest iDEAL, and nobody sees a
      // method NP7 would be paying a percentage for.
      paymentMethodTypes: ["ideal", "bancontact", "eps", "p24", "blik"],
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
      metadata: { booking_id: id, kind: "trip_card", link_id: link.id, base_cents: String(Math.round(asked * 100)), fee_cents: "0", card_region: "eea" },
      paymentIntentDescription: `NP7 ${title}${edition} · booking ${id.slice(0, 8).toUpperCase()}`,
    });
  } catch (e) {
    console.error("[portal-pay] stripe call failed:", e instanceof Error ? e.message : e);
    session = null;
  }
  if (!session) {
    await db.from("exp_payment_links").delete().eq("id", link.id);
    return bad("Could not start the payment. Please try again, or use the bank details on your invoice.", 502);
  }
  const { error: updErr } = await db.from("exp_payment_links").update({ session_id: session.id, url: session.url }).eq("id", link.id);
  if (updErr) {
    await expireCheckoutSession(session.id).catch(() => {});
    await db.from("exp_payment_links").delete().eq("id", link.id);
    return bad("Could not start the payment. Please try again.", 500);
  }
  return NextResponse.json({ url: session.url, amount: asked });
}
