/**
 * /api/portal/bookings/[id]/pay — the member pays, with whatever suits them.
 *
 * Until now the portal's answer to "how do I pay?" was a bank transfer and the
 * details on an invoice. That works, and it stays the default, but it loses the
 * guest who would have paid in thirty seconds from their banking app, and it
 * loses NP7 the days between the reminder and the transfer.
 *
 * What it offers depends on where the guest is, and `payment-methods.ts` is
 * where that is decided and why. The short version: a bank rail if their
 * country has one, a card if they are outside the EEA where the fee may
 * lawfully be added, and otherwise nothing, because the bank transfer on their
 * invoice is better than a page they cannot finish.
 *
 * That last case is not hypothetical. Until today this route named five rails
 * for everyone, and a German member pressed Pay and was handed iDEAL's Dutch
 * bank list.
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
import { coveredExtraTotal } from "@/lib/group-booking";
import { guestCountry, onlineMethodsFor, canPayOnline, cardRegionFor } from "@/lib/payment-methods";
import { cardFee } from "@/lib/card-fee";
import { classifyLinks, sweepableLinks, TRANSFER_DUE_DAYS, type LinkRow } from "@/lib/bank-transfer";

export const dynamic = "force-dynamic";

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
const NOTHING = "Please transfer using the details on your invoice below.";
/** The rails-only payment method configuration: no card, so no wallet can leak
 *  a card fee through it, and no Klarna. Set in Vercel, not in code. */
const RAILS_CONFIG = process.env.STRIPE_PMC_RAILS || "";
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every link row on this booking, for the lifecycle below.
 *
 * Two reads, because the transfer columns arrive with migration 247 and this
 * route pays for real trips today: on a deployment that has not had it yet the
 * first read fails, and a card payment that has always worked must not fail
 * with it. A read that fails BOTH ways throws. Not knowing what is already
 * live is the one state in which starting another payment is unsafe.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function linkRows(db: any, bookingId: string): Promise<LinkRow[]> {
  const base = "id, amount, status, created_by, expires_at, session_id";
  let { data, error } = await db.from("exp_payment_links")
    .select(`${base}, amount_received, funds_due_by`).eq("booking_id", bookingId);
  if (error) {
    console.warn("[portal-pay] the transfer columns are not there yet, reading without them:", error.message ?? error);
    ({ data, error } = await db.from("exp_payment_links").select(base).eq("booking_id", bookingId));
  }
  if (error) throw new Error(error.message ?? String(error));
  return (data ?? []) as LinkRow[];
}

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
    .select("id, contact_id, experience_id, agreed_price, status, covered_by_booking_id, contacts(email,phone,country,billing_country), exp_experiences(title,currency,page_template), exp_editions(label,currency)")
    .eq("id", id).maybeSingle();
  if (!booking || booking.contact_id !== user.contactId) return bad("Booking not found.", 404);
  if (booking.covered_by_booking_id) return bad("Someone else is paying for this booking.", 409);
  if (booking.status === "lost" || booking.status === "cancelled") return bad("This booking is closed.", 409);
  // A clinic ticket has its own checkout, which knows about deposits and dates.
  if (booking.exp_experiences?.page_template === "event") return bad("Use the ticket payment page for this booking.", 409);
  const currency = (booking.exp_editions?.currency as string | null) ?? (booking.exp_experiences?.currency as string | null) ?? "EUR";
  if (currency !== "EUR") return bad("Paying online is EUR only for now; your invoice has our bank details.", 409);

  // Where they are decides what they can be shown. Deciding it here as well as
  // on the page matters: the page could be stale, and a session created with a
  // method the guest cannot use is a dead end nobody sees until they are in it.
  const where = guestCountry({
    billingCountry: booking.contacts?.billing_country, country: booking.contacts?.country,
    phone: booking.contacts?.phone,
  });
  const methods = onlineMethodsFor(where);
  if (!canPayOnline(methods)) return bad(methods.unavailable ?? NOTHING, 409);

  /*
   * What is owed: this booking's price, the confirmed add-ons we bill, AND the
   * people this booking is paying for. A payer who brought two friends carries
   * all three spots on one plan, so leaving the companions out made their own
   * securing payment look like more than they owe and the button refused it.
   */
  const [{ data: pays }, { data: extras }] = await Promise.all([
    db.from("exp_payments").select("amount, direction, type, status, received_at, date, created_at").eq("booking_id", id),
    db.from("exp_booking_addons").select("price, status, notes, payment_mode").eq("booking_id", id),
  ]);
  const addons = ((extras ?? []) as { price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null }[])
    .filter((a) => effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
    .reduce((n, a) => n + (Number(a.price) || 0), 0);
  const covered = await coveredExtraTotal(db, id);
  const outstanding = r2((Number(booking.agreed_price) || 0) + addons + covered - sumReceived(pays ?? []));
  if (outstanding <= 0.01) return bad("Nothing left to pay on this booking.", 409);

  // Part payments are allowed (the securing payment, then the balance), but
  // never more than is owed and never a token amount.
  const asked = body.amount != null ? r2(Number(body.amount)) : outstanding;
  if (!Number.isFinite(asked) || asked <= 0) return bad("That amount isn't a number.");
  if (asked > outstanding + 0.01) return bad("That is more than is owed on this booking.");
  if (asked < 1) return bad("That is too small to pay online.");

  /*
   * An open link for the same money could be paid twice, so it has to be dealt
   * with, but not by refusing the guest. Somebody who opens the checkout, looks
   * at it and closes the tab is the common case, and telling them to "come back
   * in a few minutes" locks them out of paying for as long as their own
   * abandoned session lives. Their previous attempt is simply closed at Stripe
   * and replaced: a session that has been expired cannot be paid, so there is
   * nothing left to pay twice.
   *
   * A link an ADMIN made is different. Somebody sent that to them deliberately,
   * possibly with a card fee priced into it, so it is left alone and the guest
   * is told which one to use and until when.
   */
  /*
   * A TRANSFER ALREADY ON ITS WAY IS THE THIRD CASE, and the filter here used
   * to see neither it nor the row it lives on: `status = 'open' AND expires_at
   * > now()` loses a submitted transfer on day two, when the CHECKOUT has
   * expired and the MONEY has not. classifyLinks (lib/bank-transfer) is where
   * that three-way split is decided, so this page and the admin's own guard
   * cannot drift apart about what counts as live.
   */
  let rows: LinkRow[];
  try {
    rows = await linkRows(db, id);
  } catch (e) {
    // Not knowing what is already live is not a reason to start a second
    // payment. Refuse, and say so where somebody will read it.
    console.error("[portal-pay] could not read the booking's payment links:", e instanceof Error ? e.message : e);
    return bad("Could not start the payment. Please try again in a moment.", 500);
  }
  /* An awaiting row nobody ever funded, past the day we stop waiting. Swept
     here rather than on a cron: this is the one moment it matters, because the
     guest is standing in front of the button wanting to pay again. */
  const stale = sweepableLinks(rows);
  if (stale.length) {
    await db.from("exp_payment_links")
      .update({ status: "expired", note: `Nothing arrived within ${TRANSFER_DUE_DAYS} days, so the guest is not blocked by their own abandoned attempt` })
      .in("id", stale.map((l) => l.id)).eq("status", "awaiting");
  }
  const staleIds = new Set(stale.map((l) => l.id));
  const live = classifyLinks(rows.filter((l) => !staleIds.has(l.id)));
  for (const l of live.toCancel) {
    if (l.session_id) await expireCheckoutSession(l.session_id).catch(() => {});
    await db.from("exp_payment_links").update({ status: "cancelled", note: "Replaced when the guest started a new payment" }).eq("id", l.id);
  }
  // spokenForOnceReplaced, and only here: the rows it leaves out are the ones
  // just cancelled, two lines up.
  const spokenFor = live.spokenForOnceReplaced;
  if (spokenFor > 0 && asked > outstanding - spokenFor + 0.01) {
    const moving = live.inFlight[0];
    if (moving) {
      // Their own money, already sent. Telling them to "use the link we sent"
      // would be nonsense, and starting a second transfer would mean a refund.
      return bad(`We're still waiting for the €${(Number(moving.amount) || 0).toLocaleString("en-GB")} transfer you started. Bank transfers take one to three working days; your trip page shows the details if you need them again.`, 409);
    }
    const until = live.adminOpen[0]?.expires_at
      ? new Date(live.adminOpen[0].expires_at!).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : null;
    return bad(`We already sent you a payment link for ${asked === spokenFor ? "this" : "€" + spokenFor.toLocaleString("en-GB")}. Please use that one${until ? `, it is good until ${until}` : ""}.`, 409);
  }

  // Half an hour, the shortest Stripe allows. Long enough to pay, short enough
  // that an abandoned one is gone before anyone wonders about it.
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  /*
   * A card is only ever offered outside the EEA, where the surcharge is lawful,
   * so a card offer carries the fee and a rail never does. `intl` is the
   * cautious bucket: if the card turns out cheaper than that the guest is
   * overcharged, which the webhook's refund catches, and if it turns out to be
   * an EEA private card the whole fee comes back.
   */
  const region = methods.kind === "card" ? cardRegionFor(where) : "eea";
  const { fee, total } = methods.kind === "card" ? cardFee(asked, region) : { fee: 0, total: asked };
  const { data: link, error: insErr } = await db.from("exp_payment_links").insert({
    booking_id: id, contact_id: booking.contact_id,
    amount: asked, fee, total, currency, card_region: region,
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
      lines: [
        {
          name: `${title}${edition}`,
          description: asked >= outstanding - 0.01 ? "Everything still owed on your trip." : "Part payment on your trip.",
          amountCents: Math.round(asked * 100),
        },
        /*
         * Its own line, never folded into the price: the guest sees what the
         * card costs before they type a number, which is both the decent thing
         * and what §312a Abs. 4 BGB expects of a surcharge.
         *
         * It says "estimate" because it is one. The band is chosen from where
         * we believe the guest is, and a person's country is not their card's:
         * a Londoner can pay with an American card and the reverse. The webhook
         * reads the real card the moment it is charged and sends back anything
         * above what that card actually cost us, or the whole fee if it turns
         * out to be a private European card, where no surcharge may stand at
         * all. Promising the refund here is the only honest way to charge an
         * estimate.
         */
        ...(fee > 0 ? [{ name: "Card payment fee (estimate)", description: "Only on card. We check your real card when it is charged and refund anything we overestimated, automatically. A bank transfer from your invoice is free.", amountCents: Math.round(fee * 100) }] : []),
      ],
      currency,
      successUrl: `${origin}/account/bookings/${id}?paid=1#payment`,
      cancelUrl: `${origin}/account/bookings/${id}#payment`,
      customerEmail: booking.contacts?.email ?? undefined,
      /*
       * A rail guest gets the configuration and Stripe picks from where they
       * are. A card guest gets the card named outright, because the fee on the
       * bill is only lawful on a card and must not be charged on anything else.
       * If the configuration id is missing the rails are named by hand, which
       * is worse but still pays: better a Dutch guest sees a few methods they
       * cannot use than cannot pay at all.
       */
      ...(methods.kind === "card"
        ? { paymentMethodTypes: ["card"] }
        : RAILS_CONFIG
          ? { paymentMethodConfiguration: RAILS_CONFIG, excludedPaymentMethodTypes: ["klarna"] }
          : { paymentMethodTypes: ["ideal", "bancontact", "eps", "p24", "blik"] }),
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
      metadata: { booking_id: id, kind: "trip_card", link_id: link.id, base_cents: String(Math.round(asked * 100)), fee_cents: String(Math.round(fee * 100)), card_region: region },
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
  return NextResponse.json({ url: session.url, amount: asked, fee, total });
}
