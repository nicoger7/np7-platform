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
 * lawfully be added, a SEPA credit transfer to an IBAN of their own inside it,
 * and otherwise nothing, because the bank transfer on their invoice is better
 * than a page they cannot finish.
 *
 * That last case is not hypothetical. Until today this route named five rails
 * for everyone, and a German member pressed Pay and was handed iDEAL's Dutch
 * bank list.
 *
 * THE THREE KINDS ARE NOT THREE FLAVOURS OF THE SAME SESSION. A transfer needs
 * a Stripe Customer (the IBAN is issued against its cash balance, so a session
 * with only customer_email is rejected outright), it lives 23 hours rather than
 * 30 minutes, it carries no fee, it tells the webhook a different `kind`, and
 * it ends on Stripe's bank instructions rather than back here. Every one of
 * those differences was already written down in lib/bank-transfer and
 * lib/stripe-customer while this route quietly handed a transfer guest the
 * rails list, which is a checkout they cannot finish. They are decided in one
 * switch below, over the same discriminant payment-methods returned.
 *
 * The payment is recorded by the same webhook path as that link, through an
 * exp_payment_links row with a zero fee, so a payment made here is dedupe-safe,
 * tied to the Stripe credit in the bank feed, and settles its invoices.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { createCheckoutSession, expireCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { ensureStripeCustomer } from "@/lib/stripe-customer";
import { publicOrigin } from "@/lib/public-origin";
import { readRows } from "@/lib/db-read";
import { sumReceived, type PaymentLike } from "@/lib/payment-totals";
import { effectiveAddonStatus } from "@/lib/addons";
import { coveredExtraTotal } from "@/lib/group-booking";
import { guestCountry, onlineMethodsFor, canPayOnline, cardRegionFor, transferCountryFor, type PayKind , paymentDescription } from "@/lib/payment-methods";
import { cardFee, type CardRegion } from "@/lib/card-fee";
import { bankTransferParams, classifyLinks, sweepableLinks, TRANSFER_DUE_DAYS, TRANSFER_SESSION_HOURS, type LinkRow } from "@/lib/bank-transfer";

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
    // `name` is here for the Stripe Customer a transfer needs: the account it
    // issues is shown to the guest with a holder name on it, and "unnamed
    // customer" on a €1,440 transfer invites a support mail rather than a
    // payment.
    .select("id, contact_id, experience_id, agreed_price, status, covered_by_booking_id, contacts(name,email,phone,country,billing_country), exp_experiences(title,currency,page_template), exp_editions(label,currency)")
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
   *
   * THE READS MAY NOT FAIL QUIETLY. `const { data: pays } = await …` was the
   * shape here, and supabase-js resolves a failed query with { error } rather
   * than throwing: an exp_payments read that fell over came back as an empty
   * list, sumReceived of nothing is 0, and a booking paid in full read as fully
   * owing. The guest then gets a second checkout for money that is already in
   * the bank. readRows (lib/db-read) throws instead, and not knowing what has
   * been paid is answered the same way as not knowing what is already live,
   * twenty lines below: refuse, and say so where somebody will read it.
   */
  let outstanding: number;
  try {
    const [pays, extras] = await Promise.all([
      readRows<PaymentLike>(
        db.from("exp_payments").select("amount, direction, type, status, received_at, date, created_at").eq("booking_id", id),
        `payments on booking ${id}`),
      readRows<{ price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null }>(
        db.from("exp_booking_addons").select("price, status, notes, payment_mode").eq("booking_id", id),
        `add-ons on booking ${id}`),
    ]);
    const addons = extras
      .filter((a) => effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
      .reduce((n, a) => n + (Number(a.price) || 0), 0);
    const covered = await coveredExtraTotal(db, id);
    outstanding = r2((Number(booking.agreed_price) || 0) + addons + covered - sumReceived(pays));
  } catch (e) {
    console.error("[portal-pay] could not read what is owed on this booking:", e instanceof Error ? e.message : e);
    return bad("Could not start the payment. Please try again in a moment.", 500);
  }
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
  /*
   * Only a checkout Stripe has ACTUALLY closed may be treated as replaced.
   * expireCheckoutSession answers { ok: false } on a Stripe error rather than
   * throwing, so the old catch caught nothing and the row was marked cancelled
   * regardless: the guest went back to the old tab, paid there, paid the new
   * one too, and the guard had already stopped counting the first.
   *
   * A session Stripe would not close is still payable, so it stays live and
   * keeps counting. The guest is refused this once, which is the cheap failure.
   */
  const replaced: string[] = [];
  for (const l of live.toCancel) {
    if (l.session_id) {
      const res = await expireCheckoutSession(l.session_id).catch(() => ({ ok: false as const }));
      if (!res?.ok) continue;
    }
    const { error: cancelErr } = await db.from("exp_payment_links")
      .update({ status: "cancelled", note: "Replaced when the guest started a new payment" }).eq("id", l.id);
    if (!cancelErr) replaced.push(l.id);
  }
  // Only the rows genuinely cancelled above drop out of the count.
  const spokenFor = classifyLinks(rows.filter((l) => !staleIds.has(l.id) && !replaced.includes(l.id))).spokenFor;
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

  const origin = publicOrigin();
  const home = `${origin}/account/bookings/${id}`;
  const title = booking.exp_experiences?.title ?? "NP7 Experience";
  const edition = booking.exp_editions?.label ? ` · ${booking.exp_editions.label}` : "";

  /*
   * THE CUSTOMER, AND WHY A TRANSFER REFUSES WITHOUT ONE.
   *
   * A bank transfer is paid into a cash balance and a cash balance belongs to a
   * Stripe Customer, so the IBAN cannot be issued for a session created with
   * only customer_email: Stripe rejects the whole session rather than quietly
   * offering something else. That is why this is a refusal and not a fallback.
   * ensureStripeCustomer keys on the contact id, so two presses a second apart
   * cannot mint two Customers and therefore two IBANs for one human, and it is
   * asked for here only where it is needed: nothing else pays for the round trip.
   */
  let customer = "";
  if (methods.kind === "transfer") {
    try {
      customer = (await ensureStripeCustomer(db, {
        contactId: booking.contact_id,
        email: booking.contacts?.email ?? null,
        name: booking.contacts?.name ?? null,
      })) ?? "";
    } catch (e) {
      console.error("[portal-pay] could not resolve the Stripe customer:", e instanceof Error ? e.message : e);
    }
    if (!customer) {
      return bad("We couldn't set up the bank transfer just now. The account details on your invoice below reach the same place, or try again in a moment.", 502);
    }
  }

  /*
   * ── THE THREE SHAPES OF A PAYMENT, DECIDED ONCE ─────────────────────────
   *
   * A rail, a card and a transfer differ in nearly every parameter Stripe is
   * handed, and they used to differ in two inline ternaries and one shared
   * 30-minute expiry. That is exactly how a transfer ended up being given the
   * rails list, a 30-minute clock and no Customer: a checkout the guest cannot
   * finish, which is worse than the honest refusal they get with the flag off.
   *
   * So each kind states its whole shape, in one place, and the `never` in the
   * default is the point of the switch. The day Wero is granted, or a fourth
   * kind is added, tsc stops on that line instead of letting the new kind fall
   * into whichever arm happened to be last.
   */
  type CheckoutOpts = Parameters<typeof createCheckoutSession>[0];
  type PaySetup = {
    /** exp_payment_links.method, in the vocabulary migration 247 gave the column. */
    method: PayKind;
    /** The EXACT string the webhook's handlers match on. Get it wrong and the
     *  money lands at Stripe and nowhere in the platform, silently. */
    metadataKind: "trip_card" | "trip_transfer";
    /** How long the CHECKOUT URL lives, and only that. The money's own clock is
     *  the row's status plus funds_due_by, started when Stripe issues the IBAN;
     *  see the column comments in migration 247. */
    sessionMs: number;
    /** Where Stripe sends the guest when it is finished with them. */
    successUrl: string;
    /** The surcharge. Only a card may ever carry one (§270a BGB). */
    fee: number;
    total: number;
    region: CardRegion;
    /** What the link row says it is, for the admin reading it later. */
    note: string;
    /** Columns only this kind writes. */
    row: Record<string, string>;
    /** Stripe's own parameters for this method. It takes the link id because a
     *  transfer's PaymentIntent needs its own copy: a PI-level event carries no
     *  session at all, so nothing else points a partial funding back at the row. */
    stripe: (linkId: string) => Pick<CheckoutOpts,
      "customer" | "customerEmail" | "paymentMethodTypes" | "paymentMethodConfiguration"
      | "excludedPaymentMethodTypes" | "extraParams" | "paymentIntentMetadata">;
  };

  const email = booking.contacts?.email ?? undefined;
  /** Half an hour is the shortest Stripe allows: long enough to pay on an
   *  instant method, short enough that an abandoned one is gone before anyone
   *  wonders about it. */
  const INSTANT_MS = 30 * 60 * 1000;
  const setup: PaySetup = ((): PaySetup => {
    switch (methods.kind) {
      case "rail":
        return {
          method: "rail", metadataKind: "trip_card", sessionMs: INSTANT_MS,
          successUrl: `${home}?paid=1#payment`,
          fee: 0, total: asked, region: "eea",
          note: "Paid by the member from their trip page", row: {},
          /* The configuration, so Stripe filters by where the guest actually is.
             If its id is missing the rails are named by hand, which is worse but
             still pays: better a Dutch guest sees a few methods they cannot use
             than cannot pay at all. */
          stripe: () => ({
            customerEmail: email,
            ...(RAILS_CONFIG
              ? { paymentMethodConfiguration: RAILS_CONFIG, excludedPaymentMethodTypes: ["klarna"] }
              : { paymentMethodTypes: ["ideal", "bancontact", "eps", "p24", "blik"] }),
          }),
        };
      case "card": {
        /* A card is only ever offered outside the EEA, where the surcharge is
           lawful, so a card offer carries the fee and nothing else does. The
           band is the cautious one: if the card turns out cheaper the guest is
           overcharged, which the webhook's refund catches, and if it turns out
           to be an EEA private card the whole fee comes back. */
        const region = cardRegionFor(where);
        const { fee, total } = cardFee(asked, region);
        return {
          method: "card", metadataKind: "trip_card", sessionMs: INSTANT_MS,
          successUrl: `${home}?paid=1#payment`,
          fee, total, region,
          note: "Paid by the member from their trip page", row: {},
          // Named outright, because the fee on the bill is lawful on a card and
          // must not be charged on anything else.
          stripe: () => ({ customerEmail: email, paymentMethodTypes: ["card"] }),
        };
      }
      case "transfer":
        return {
          method: "transfer", metadataKind: "trip_transfer",
          // 23 hours, not 30 minutes. A transfer guest reads the mail in the
          // evening and opens the link the next morning; see TRANSFER_SESSION_HOURS.
          sessionMs: TRANSFER_SESSION_HOURS * 3600 * 1000,
          /* NOT `?paid=1`. Nothing has been paid: Stripe keeps this guest on its
             own instructions page with their account number, and the money moves
             for days afterwards. A guest who does find their way back here must
             not be congratulated on a payment that has not happened. */
          successUrl: `${home}#payment`,
          // §270a BGB bans a surcharge on a SEPA credit transfer outright, so
          // this is a flat 0 rather than a lookup.
          fee: 0, total: asked, region: "eea",
          note: "Bank transfer the member started from their trip page",
          /*
           * `method` is written here and nowhere else, which looks inconsistent
           * and is deliberate. The column arrives with migration 247, which is
           * applied by hand, so naming it in a rail or card insert would fail
           * every payment that works today on a deployment that has not had it.
           * Those rows do not need it: the webhook reads kind 'trip_card' for
           * them. A transfer cannot happen at all without the flag, and the
           * migration's own preconditions put the flag after applying it.
           */
          row: { method: "transfer" },
          stripe: (linkId) => ({
            // The Customer INSTEAD of the email: Stripe refuses both at once,
            // and only a Customer can carry the cash balance the IBAN pays into.
            customer,
            extraParams: bankTransferParams({ customer, country: transferCountryFor(where) }),
            paymentIntentMetadata: { booking_id: id, kind: "trip_transfer", link_id: linkId },
          }),
        };
      default: {
        const unreachable: never = methods.kind;
        throw new Error(`no session shape for payment kind ${String(unreachable)}`);
      }
    }
  })();

  const expiresAt = new Date(Date.now() + setup.sessionMs);
  const { data: link, error: insErr } = await db.from("exp_payment_links").insert({
    booking_id: id, contact_id: booking.contact_id,
    amount: asked, fee: setup.fee, total: setup.total, currency, card_region: setup.region,
    status: "open", note: setup.note, created_by: "member",
    expires_at: expiresAt.toISOString(),
    ...setup.row,
  }).select("id").single();
  if (insErr || !link) return bad("Could not start the payment. Please try again.", 500);

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
         * estimate. A transfer never reaches this line: its fee is 0.
         */
        ...(setup.fee > 0 ? [{ name: "Card payment fee (estimate)", description: "Only on card. We check your real card when it is charged and refund anything we overestimated, automatically. A bank transfer from your invoice is free.", amountCents: Math.round(setup.fee * 100) }] : []),
      ],
      currency,
      successUrl: setup.successUrl,
      cancelUrl: `${home}#payment`,
      ...setup.stripe(link.id),
      expiresAt: Math.floor(expiresAt.getTime() / 1000),
      metadata: { booking_id: id, kind: setup.metadataKind, link_id: link.id, base_cents: String(Math.round(asked * 100)), fee_cents: String(Math.round(setup.fee * 100)), card_region: setup.region },
      paymentIntentDescription: paymentDescription(title, edition, id),
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
  /* `method` so the caller can say what is about to happen rather than guess:
     a transfer is not a payment yet, and "Opening…" is the last honest word
     this route can offer before Stripe's instructions page takes over. */
  return NextResponse.json({ url: session.url, amount: asked, fee: setup.fee, total: setup.total, method: setup.method });
}
