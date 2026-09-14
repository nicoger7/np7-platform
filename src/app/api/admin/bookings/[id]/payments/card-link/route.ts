/**
 * /api/admin/bookings/[id]/payments/card-link — pay by card, on request.
 *
 *   GET     the links made for this booking, newest first
 *   POST    make one: a Stripe Checkout session for an amount the admin names,
 *           with the card cost on top where the law allows it (lib/card-fee)
 *   DELETE  ?linkId= cancel an open link (the session is expired at Stripe)
 *
 * The guest pays on Stripe's hosted page; the webhook records the money on
 * the booking with provenance 'stripe' and marks the link paid. The fee never
 * becomes trip revenue: it lives on the link, for the books.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminGate, getRequestMember, getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase";
import { createCheckoutSession, expireCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { cardFee, isCardRegion, CARD_REGIONS } from "@/lib/card-fee";
import { publicOrigin } from "@/lib/public-origin";
import { sumReceived } from "@/lib/payment-totals";
import { effectiveAddonStatus } from "@/lib/addons";

export const dynamic = "force-dynamic";

/** A live pay URL and the figures on it are money: the same gate the booking's
 *  bank route puts on every method. */
async function moneyDenied(): Promise<NextResponse | null> {
  const access = await getRequestAccess();
  if (!access || !effectiveCanSeeField(access, "money")) {
    return NextResponse.json({ error: "Your role cannot see payments." }, { status: 403 });
  }
  return null;
}

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What is still owed on a booking: price plus confirmed add-ons the guest
 *  pays through us, less money received. The same rule the booking page uses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function owed(db: any, id: string, agreedPrice: number): Promise<number> {
  const [{ data: pays }, { data: extras }] = await Promise.all([
    db.from("exp_payments").select("amount, direction, type, status, received_at, date, created_at").eq("booking_id", id),
    db.from("exp_booking_addons").select("price, status, notes, payment_mode").eq("booking_id", id),
  ]);
  const addons = ((extras ?? []) as { price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null }[])
    .filter((a) => effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
    .reduce((n, a) => n + (Number(a.price) || 0), 0);
  return r2(agreedPrice + addons - sumReceived(pays ?? []));
}

/** Links that are still live: their amounts are spoken for. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function openLinkTotal(db: any, id: string): Promise<number> {
  const { data } = await db.from("exp_payment_links").select("amount").eq("booking_id", id).eq("status", "open").gt("expires_at", new Date().toISOString());
  return r2(((data ?? []) as { amount: number }[]).reduce((n, l) => n + Number(l.amount), 0));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  // The booking route redacts money for roles without the field; a live pay
  // URL and the figures on it are money too.
  if (await moneyDenied()) return NextResponse.json({ links: [], configured: stripeConfigured(), money_redacted: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db.from("exp_bookings").select("agreed_price, exp_editions(currency), exp_experiences(currency)").eq("id", id).maybeSingle();
  const outstanding = booking ? await owed(db, id, Number(booking.agreed_price) || 0) : 0;
  const currency = (booking?.exp_editions?.currency as string | null) ?? (booking?.exp_experiences?.currency as string | null) ?? "EUR";
  const { data, error } = await db.from("exp_payment_links")
    .select("id, amount, fee, total, currency, card_region, status, url, note, created_at, expires_at, paid_at, payment_intent, fee_refunded_at, fee_refund_reason, card_country, card_brand")
    .eq("booking_id", id).order("created_at", { ascending: false });
  if (error) return bad(error.message, 500);
  // A link past its expiry reads as expired even before Stripe tells us.
  const now = Date.now();
  const links = (data ?? []).map((l: { status: string; expires_at: string | null }) =>
    l.status === "open" && l.expires_at && new Date(l.expires_at).getTime() < now ? { ...l, status: "expired" } : l);
  return NextResponse.json({ links, configured: stripeConfigured(), outstanding, currency });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = (await requireAdminGate()) ?? (await moneyDenied());
  if (denied) return denied;
  if (!stripeConfigured()) return bad("Stripe is not configured on this deployment.", 503);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const amount = r2(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return bad("Amount must be a positive number.");
  const region = body.cardRegion;
  if (!isCardRegion(region)) return bad("Say which card family the link is for.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  const member = await getRequestMember();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db.from("exp_bookings")
    .select("id, contact_id, experience_id, agreed_price, status, contacts(name,email), exp_experiences(title,currency,page_template), exp_editions(label,date_start,date_end,currency)")
    .eq("id", id).maybeSingle();
  if (!booking) return bad("Booking not found.", 404);
  if (booking.status === "lost" || booking.status === "cancelled") return bad("This booking is closed; nothing to pay on it.");
  // Event tickets have their own Stripe flow (deposit, balance, confirm-date)
  // with its own idea of status; a card link would fight it.
  if (booking.exp_experiences?.page_template === "event") return bad("Event tickets are paid through the event's own checkout, not a card link.", 409);
  // The fee table is Stripe's EUR price list and exp_payments carries no
  // currency; a link in another currency would be recorded as euros.
  const currency = (booking.exp_editions?.currency as string | null) ?? (booking.exp_experiences?.currency as string | null) ?? "EUR";
  if (currency !== "EUR") return bad(`This booking is in ${currency}; card links are EUR only for now.`, 409);

  // Never a link for more than is owed, and links still open count as owed
  // already: two live links for the balance would let a guest pay it twice.
  const outstanding = await owed(db, id, Number(booking.agreed_price) || 0);
  const open = await openLinkTotal(db, id);
  if (amount > outstanding - open + 0.01) {
    return bad(open > 0
      ? `${money(outstanding)} is owed and ${money(open)} of it is already on an open link. Cancel that link first, or ask for at most ${money(Math.max(0, outstanding - open))}.`
      : `Only ${money(outstanding)} is still owed on this booking; the link cannot ask for more.`);
  }
  const { fee, total } = cardFee(amount, region);
  const regionLabel = CARD_REGIONS.find((r) => r.key === region)!.label;

  // The row first, so the session can carry its id and the webhook can close it.
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  const { data: link, error: insErr } = await db.from("exp_payment_links").insert({
    booking_id: id, contact_id: booking.contact_id ?? null,
    amount, fee, total, currency, card_region: region, status: "open", note: note || null,
    created_by: member?.id ?? "admin", expires_at: expiresAt.toISOString(),
  }).select("id").single();
  if (insErr || !link) return bad(`Could not save the link: ${insErr?.message ?? "insert failed"}`, 500);

  const origin = publicOrigin();
  const title = booking.exp_experiences?.title ?? "NP7 Experience";
  const edition = booking.exp_editions?.label ? ` · ${booking.exp_editions.label}` : "";
  // A Stripe call that throws (network, timeout) must not leave a half-made
  // link on the booking: the row goes with it, same as when Stripe says no.
  let session: { url: string; id: string } | null = null;
  try {
    session = await createCheckoutSession({
    lines: [
      { name: `${title}${edition}`, description: `Payment on your booking ${id.slice(0, 8).toUpperCase()}`, amountCents: Math.round(amount * 100) },
      ...(fee > 0 ? [{ name: "Card processing fee", description: "Our payment provider's actual cost for this card type. Paying by bank transfer is free of charge.", amountCents: Math.round(fee * 100) }] : []),
    ],
    currency,
    successUrl: `${origin}/account/bookings/${id}?paid=card`,
    cancelUrl: `${origin}/account/bookings/${id}`,
    customerEmail: booking.contacts?.email ?? undefined,
    // With a fee on the bill the session takes cards only, so the fee can
    // never be charged on a SEPA or Klarna payment it was not priced for.
    paymentMethodTypes: fee > 0 ? ["card"] : undefined,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
    metadata: {
      booking_id: id, kind: "trip_card", link_id: link.id,
      base_cents: String(Math.round(amount * 100)), fee_cents: String(Math.round(fee * 100)), card_region: region,
    },
    paymentIntentDescription: `NP7 ${title}${edition} · booking ${id.slice(0, 8).toUpperCase()}${fee > 0 ? " incl. card fee" : ""}`,
    });
  } catch (e) {
    console.error("[card-link] stripe call failed:", e instanceof Error ? e.message : e);
    session = null;
  }
  if (!session) {
    await db.from("exp_payment_links").delete().eq("id", link.id);
    return bad("Stripe did not return a checkout link. Nothing was saved.", 502);
  }
  const { error: updErr } = await db.from("exp_payment_links").update({ session_id: session.id, url: session.url }).eq("id", link.id);
  if (updErr) {
    // The session exists at Stripe but our record of it does not: close it,
    // or a guest could pay a link the platform cannot recognise.
    await expireCheckoutSession(session.id).catch(() => {});
    await db.from("exp_payment_links").delete().eq("id", link.id);
    return bad(`Could not save the link: ${updErr.message}`, 500);
  }
  void regionLabel;
  return NextResponse.json({ ok: true, link: { id: link.id, url: session.url, amount, fee, total, currency, card_region: region, expires_at: expiresAt.toISOString() } });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = (await requireAdminGate()) ?? (await moneyDenied());
  if (denied) return denied;
  const { id } = await params;
  const linkId = request.nextUrl.searchParams.get("linkId");
  if (!linkId) return bad("linkId missing");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: link } = await db.from("exp_payment_links").select("id, booking_id, status, session_id").eq("id", linkId).maybeSingle();
  if (!link || link.booking_id !== id) return bad("Link not found.", 404);
  if (link.status === "paid") return bad("This link was paid; refund it in Stripe if the money must go back.");
  if (link.session_id) {
    const r = await expireCheckoutSession(link.session_id);
    if (!r.ok && !/already expired|No such/i.test(r.error ?? "")) return bad(`Stripe would not expire the session: ${r.error}`, 502);
  }
  await db.from("exp_payment_links").update({ status: "cancelled" }).eq("id", linkId);
  return NextResponse.json({ ok: true });
}
