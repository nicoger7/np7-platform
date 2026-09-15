/**
 * Stripe webhook handler.
 *
 * Verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET.
 * If STRIPE_WEBHOOK_SECRET is not configured → no-op 200 (safe in dev/pre-config).
 *
 * On checkout.session.completed (deposit):
 *  - Marks the booking downpayment_received + status='confirmed' (idempotent).
 *  - Runs the shared onDepositPaid side effects (member account + confirmation email).
 *  - Auto-generates deposit_invoice + booking_confirmation (best-effort, never fails the webhook).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { generateDocument, settleInvoices } from "@/lib/invoices/generate";
import { eur, cardForPaymentIntent, refundPaymentIntent, paymentIntentDetails, transferInstructions } from "@/lib/stripe";
import { recordedAmount, fundsDueBy } from "@/lib/bank-transfer";
import { feeAllowedOnCard, cardRegionFromCard, cardFee } from "@/lib/card-fee";
import { publicOrigin } from "@/lib/public-origin";
import { sumReceived } from "@/lib/payment-totals";
import { effectiveAddonStatus } from "@/lib/addons";
import { computePaymentPlan } from "@/lib/payments";
import { addressFromStripe, fillGaps, type BillingAddress, type StripeAddress } from "@/lib/billing-address";
// ─── Stripe signature verification (no stripe npm package needed) ─────────────

async function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string
): Promise<boolean> {
  // Stripe-Signature: t=...,v1=...,v1=...
  const parts = sigHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});

  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  // Replay protection: reject events older than 5 minutes
  const diff = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (diff > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;

  // HMAC-SHA256
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return expected === signature;
}

// ─── Reads that cannot fail quietly ──────────────────────────────────────────

/**
 * THE ONE RULE FOR EVERY READ IN THIS FILE.
 *
 * supabase-js does not throw on a failed query: it resolves with { error }. So
 * `const { data } = await db.from(…)` makes a database failure look exactly
 * like "there is no such row", and a no-match is answered everywhere below by
 * returning quietly, which ends in a 200, which tells Stripe the event was
 * handled and it is never delivered again. A guest's money then exists in
 * Stripe and nowhere in the platform, with nothing in any log.
 *
 * These two throw instead. The route turns that into a 500, Stripe retries with
 * backoff for days, and every write below is idempotent so a replay costs
 * nothing. Only a read that SUCCEEDED and found nothing returns null, and that
 * is the only case a caller may treat as "not ours".
 *
 * The transient version is not hypothetical: PostgREST caches the schema, so
 * for a while after migration 247 is applied a select naming its new columns
 * comes back as an error rather than as a row. Retrying is exactly right.
 */
async function readOne<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: PromiseLike<{ data: any; error: { message?: string } | null }>,
  what: string,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw new Error(`read failed (${what}): ${error.message ?? JSON.stringify(error)}`);
  return (data as T | null) ?? null;
}

async function readMany<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: PromiseLike<{ data: any; error: { message?: string } | null }>,
  what: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`read failed (${what}): ${error.message ?? JSON.stringify(error)}`);
  return ((data ?? []) as T[]);
}

// ─── Shared onDepositPaid logic (mirrors the thanks page) ─────────────────────

async function onDepositPaid(bookingId: string, origin: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // Hold-deposit paid → the spot is secured and they're confirmed/attending
  // (idempotent — update is safe to re-run).
  await db
    .from("exp_bookings")
    .update({
      status: "confirmed",
      downpayment_received: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  // Re-fetch for side effects. readOne, so a database blip cannot masquerade as
  // "this booking is gone" and silently cost the guest their member account and
  // their confirmation mail.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const booking = await readOne<any>(
    db
      .from("exp_bookings")
      .select(
        "id, contact_id, exp_experiences(title), exp_editions(date_start,date_end), contacts(name,email)"
      )
      .eq("id", bookingId)
      .maybeSingle(),
    `booking ${bookingId}`,
  );

  if (!booking) return;
  const contact = booking.contacts;
  if (!contact?.email) return;

  const firstName: string | undefined = (contact.name ?? "").split(" ")[0] || undefined;

  // Provision member account
  const { ensureMemberAccount } = await import("@/lib/members");
  const acct = await ensureMemberAccount({
    contactId: booking.contact_id,
    email: contact.email,
    origin,
  }).catch(() => null);

  // Send deposit confirmation email
  const { sendEmail } = await import("@/lib/email/send");

  // Build date range string
  const dateStart: string | null = booking.exp_editions?.date_start ?? null;
  const dateEnd: string | null = booking.exp_editions?.date_end ?? null;
  let dates: string | undefined;
  if (dateStart) {
    const d = (x: Date) =>
      x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const s = new Date(dateStart);
    const e = dateEnd ? new Date(dateEnd) : null;
    dates = e ? `${d(s)} - ${d(e)} ${e.getFullYear()}` : `${d(s)} ${s.getFullYear()}`;
  }

  // Generate + FILE the deposit invoice and booking confirmation PDFs (best-effort).
  // They live in the member's portal — we no longer attach them to the email
  // (portal-only, per the team's preference).
  try {
    await generateDocument({ bookingId, type: "deposit_invoice" });
  } catch (err) {
    console.warn("[webhook] deposit_invoice generation failed (non-fatal):", err);
  }
  try {
    await generateDocument({ bookingId, type: "booking_confirmation" });
  } catch (err) {
    console.warn("[webhook] booking_confirmation generation failed (non-fatal):", err);
  }

  // Send the deposit confirmation email — it points the member to their account,
  // where the invoice and confirmation are filed.
  const activationLink =
    acct && "link" in acct ? acct.link : `${origin}/account/login`;

  await sendEmail({
    to: contact.email,
    templateKey: "deposit_confirmation",
    vars: {
      firstName,
      experienceTitle: booking.exp_experiences?.title,
      dates,
      activationLink,
    },
    bookingId,
    contactId: booking.contact_id,
    dedupeKey: `deposit_confirmation:${bookingId}`,
  }).catch(() => {});
}

// ─── Event ticket payments (deposit / full / balance) ────────────────────────

/** "Fri 14 – Sat 15 Aug 2026" — what a buyer wants to see on their receipt. */
function fmtEventDates(start?: string | null, end?: string | null): string | undefined {
  if (!start) return undefined;
  const d = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
  const full: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" };
  if (!end || end === start) return d(start, full);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${d(start, sameMonth ? { weekday: "short", day: "numeric" } : { weekday: "short", day: "numeric", month: "short" })} - ${d(end, full)}`;
}

async function onEventPayment(
  session: Record<string, unknown>,
  kind: string,
  bookingId: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const paymentIntent = typeof session["payment_intent"] === "string" ? (session["payment_intent"] as string) : null;
  const amount = Number(session["amount_total"] ?? 0) / 100; // Stripe minor units → major

  // readOne: a failed read throws and Stripe retries. A genuinely missing
  // booking does not, because retrying that forever is just noise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const booking = await readOne<any>(
    db
      .from("exp_bookings")
      .select("id, contact_id, experience_id, status, agreed_price, downpayment_received, final_payment_received, exp_packages(final_days_before), exp_experiences(title,location,currency), exp_editions(date_start,date_end,location), contacts(name,email)")
      .eq("id", bookingId).maybeSingle(),
    `booking ${bookingId}`,
  );
  if (!booking) {
    console.error(`[webhook] PAID but no booking ${bookingId} — money taken with nothing to attach it to`);
    return;
  }

  // Booking state per kind (idempotent).
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // Every kind, not just deposits — a full-price ticket is the commonest case
  // and its booking was left with no way back to the Stripe charge at all.
  if (paymentIntent) patch.stripe_payment_intent = paymentIntent;
  // 'reserved' is right for STAND-BY — the date isn't settled, so the spot is
  // held rather than booked. A fixed-date clinic paid in part is different:
  // that rider is coming on the 14th. 'confirmed' is the status that means
  // deposit-paid-and-attending, and it is what the funnel counts.
  if (kind === "event_deposit") { patch.downpayment_received = true; patch.status = "reserved"; }
  if (kind === "event_part") { patch.downpayment_received = true; patch.status = "confirmed"; }
  if (kind === "event_full") { patch.downpayment_received = true; patch.final_payment_received = true; patch.status = "paid"; }
  if (kind === "event_balance") { patch.final_payment_received = true; patch.status = "paid"; }
  // THE write that turns a paid ticket into a paid booking — and the one that
  // had no error handling at all. If it fails, throw: better Stripe retries in
  // a minute than a customer who paid and is still 'lead' on Friday morning.
  const { error: updErr } = await db.from("exp_bookings").update(patch).eq("id", bookingId);
  if (updErr) throw new Error(`booking update failed for ${bookingId}: ${updErr.message ?? updErr}`);

  // The invoice, BEFORE the payment is recorded.
  //
  // A trip gets a deposit invoice + booking confirmation on its deposit; an
  // event got neither, so a buyer paid €400 and the platform issued no
  // document at all. Stripe's receipt is a card receipt, not a German invoice:
  // no NP7 GmbH details, no VAT treatment, no sequential number.
  //
  // Order matters. generateDocument derives the amount from (total − received),
  // so once the payment row exists the outstanding balance is zero and it
  // refuses with "nothing to invoice". Issue first, then settle it.
  // A part-payment gets its deposit invoice here for the same reason a full
  // ticket gets its final invoice: Stripe's card receipt is not a German
  // invoice. The balance is invoiced separately when it is paid.
  if (kind === "event_full" || kind === "event_balance" || kind === "event_part") {
    // A part-payment must be invoiced as the DEPOSIT it is. `final_invoice`
    // derives its amount from (total − received), so on a €100 deposit against
    // a €400 ticket it would issue a €400 invoice for a €100 payment — and the
    // balance would then have nothing left to invoice in August.
    const type = kind === "event_part" ? "deposit_invoice" : "final_invoice";
    try {
      await generateDocument({ bookingId, type });
    } catch (err) {
      console.warn("[webhook] event invoice generation failed (non-fatal):", err);
    }
  }

  // Record the money in exp_payments (drives admin reconciliation).
  if (paymentIntent) {
    // Oldest-match-wins, not maybeSingle(): once two rows ever shared a
    // reference, maybeSingle() errors and the duplicate guard would be dead
    // forever, adding a row on every redelivery. The real backstop is the
    // unique index from migration 159 — this just avoids the noise.
    const dupRows = await readMany<{ id: string }>(
      db.from("exp_payments").select("id").eq("reference", paymentIntent).limit(1),
      `payment for ${paymentIntent}`,
    );
    const dup = dupRows[0] ?? null;
    if (!dup) {
      const { error: payErr } = await db.from("exp_payments").insert({
        booking_id: bookingId,
        contact_id: booking.contact_id,
        experience_id: booking.experience_id,
        amount,
        type: kind === "event_deposit" || kind === "event_part" ? "deposit" : "final",
        method: "stripe",
        direction: "revenue",
        status: "paid",
        reference: paymentIntent,
        received_at: new Date().toISOString(),
        notes: `Stripe ${kind.replace("event_", "")} · session ${session["id"] ?? ""}`,
      });
      // `.then(undefined, () => {})` used to sit here — dead code, because a
      // PostgREST insert resolves with { error } instead of rejecting. So the
      // failure was invisible twice over. exp_payments is the ONLY record of
      // this revenue; a lost row means the money is in Stripe and nowhere in
      // the platform, and the booking looks paid so nobody goes looking.
      // 23505 = the unique index caught a duplicate delivery, which is the
      // guard doing its job, not a failure.
      if (payErr && payErr.code !== "23505") {
        console.error(`[webhook] PAYMENT ROW LOST for booking ${bookingId} (${paymentIntent}):`, payErr.message ?? payErr);
        throw new Error(`payment insert failed for ${bookingId}: ${payErr.message ?? payErr}`);
      }
    }
  }

  // The card cleared, so the invoice this charge covers is settled.
  await settleInvoices(bookingId).catch((e) =>
    console.warn("[webhook] invoice settle failed (non-fatal):", e instanceof Error ? e.message : e));

  // An event buyer becomes a member, exactly like a trip buyer.
  //
  // Trips do this on their /thanks page (ensureMemberAccount → magic link in
  // the confirmation mail). Events redirected straight back to the sales page
  // and did none of it, so someone who had just paid €400 had no account, no
  // trip page, and nowhere to sign the waiver — the whole reason the waiver
  // work above exists. The account is created HERE, on the payment webhook,
  // because that is the moment the money is real and it fires whether or not
  // the buyer's browser ever came back from Stripe.
  const contact = booking.contacts;
  if (contact?.email) {
    const firstName: string | undefined = (contact.name ?? "").split(" ")[0] || undefined;
    const origin = publicOrigin();
    let activationLink = `${origin}/account/login`;
    try {
      const { ensureMemberAccount } = await import("@/lib/members");
      const acct = await ensureMemberAccount({
        contactId: booking.contact_id,
        email: contact.email,
        origin,
        next: `/account/bookings/${bookingId}`,
      });
      if (acct && "link" in acct) activationLink = acct.link;
    } catch { /* never fail a payment over account setup — the login page still works */ }

    const { sendEmail } = await import("@/lib/email/send");
    // Three different situations, three different mails. A fixed-date clinic
    // paid in part must NOT get the stand-by copy — its date is not in doubt.
    const templateKey = kind === "event_part"
      ? "event_part_received"
      : kind === "event_deposit"
        ? "event_deposit_received"
        : "event_ticket_confirmed";
    // What is still owed, and when — straight off the money and the package,
    // the same two sources the ticket box and the member page read.
    let outstanding = 0;
    let balanceDueISO: string | null = null;
    if (kind === "event_part") {
      try {
        const { outstandingForBooking } = await import("@/lib/events");
        ({ outstanding } = await outstandingForBooking(db, bookingId, Number(booking.agreed_price) || 0));
        const start = booking.exp_editions?.date_start ?? null;
        const days = booking.exp_packages?.final_days_before ?? null;
        if (start && days != null) {
          balanceDueISO = new Date(new Date(`${start}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10);
        }
      } catch (err) {
        // A receipt missing one line beats no receipt: never fail the mail —
        // or the webhook — over the balance figure.
        console.warn("[webhook] balance figures for the deposit mail failed:", err);
      }
    }
    await sendEmail({
      to: contact.email,
      templateKey,
      vars: {
        firstName,
        experienceTitle: booking.exp_experiences?.title,
        // The template asks for Dates and Paid; the webhook never passed
        // either, and facts() drops empty rows — so a payment confirmation
        // arrived saying neither when the event is nor what was charged. The
        // one mail a buyer keeps as their receipt.
        dates: fmtEventDates(booking.exp_editions?.date_start, booking.exp_editions?.date_end),
        amount: eur(amount, booking.exp_experiences?.currency ?? "EUR"),
        location: booking.exp_editions?.location || booking.exp_experiences?.location || undefined,
        balance: outstanding > 0 ? eur(outstanding, booking.exp_experiences?.currency ?? "EUR") : undefined,
        balanceDue: balanceDueISO
          ? new Date(`${balanceDueISO}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
          : undefined,
        activationLink,
        bookingLink: `${origin}/account/bookings/${bookingId}`,
        waiverLink: `${origin}/account/bookings/${bookingId}/waiver`,
      },
      bookingId,
      contactId: booking.contact_id,
      dedupeKey: `${templateKey}:${bookingId}`,
    }).catch(() => {});
  }
}

// ─── A payment against a link (a card link, or a bank transfer) ──────────────

/**
 * The guest paid a link: a hand-made card link ("trip_card") or a bank transfer
 * they started themselves ("trip_transfer"). Record the trip amount on the
 * booking with provenance 'stripe', close the link, bring the booking's paid
 * flags up to date, then let the invoice engine do what it does for any money
 * landing (promote a paid pro-forma, settle invoices). The card fee, if any,
 * stays on the link row: it is not trip revenue.
 *
 * ONE function for both, deliberately. The dedupe on pi_/stripe:pi_, the 23505
 * handling, the plan recomputation, afterMoneyLanded and the bank-feed linking
 * encode several bugs already paid for; a second copy for transfers would be a
 * second place for them to come back. The card-fee tail below is already behind
 * `if (fee > 0)`, which a transfer can never be, so it costs a transfer nothing.
 *
 * This is the ONLY function in this file that may touch exp_payments. The
 * awaiting and partly-funded handlers below do not import it and must not.
 */
async function onTripLinkPayment(session: Record<string, unknown>, bookingId: string, eventCreated?: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const md = (session["metadata"] as Record<string, string> | null) ?? {};
  const kind = md["kind"] || "trip_card";
  const paymentIntent = typeof session["payment_intent"] === "string" ? (session["payment_intent"] as string) : null;
  const linkId = md["link_id"] || null;
  if (!paymentIntent || !linkId) {
    console.error(`[webhook] ${kind} for booking ${bookingId} without a payment intent or link id — nothing recorded`);
    return;
  }
  // The link row is the record of what was asked for; the session metadata is
  // only the key to it. Anyone able to craft a session cannot make this record
  // money on a booking the link does not belong to.
  let { data: link, error: linkErr } = await db.from("exp_payment_links")
    .select("id, booking_id, session_id, amount, fee, total, status, method")
    .eq("id", linkId).maybeSingle();
  if (linkErr) {
    /* `method` arrives with migration 247, which is applied by hand, so this
       deploy can land ahead of it. A card link settling real money must not
       start returning 500 over a missing column: read what has always been
       there and let the session metadata say what kind of payment it is. */
    console.error(`[webhook] link read failed for ${linkId}, retrying without the method column:`, linkErr.message ?? linkErr);
    ({ data: link, error: linkErr } = await db.from("exp_payment_links")
      .select("id, booking_id, session_id, amount, fee, total, status")
      .eq("id", linkId).maybeSingle());
  }
  if (linkErr) throw new Error(`link read failed for ${linkId}: ${linkErr.message ?? linkErr}`);
  if (!link || link.booking_id !== bookingId || (link.session_id && link.session_id !== session["id"])) {
    console.error(`[webhook] ${kind} session ${session["id"]} does not match link ${linkId} on booking ${bookingId} — refused`);
    return;
  }
  /*
   * WHAT ARRIVED, not what was asked for.
   *
   * On a card the two are the same to the cent. On a transfer they are two
   * different numbers, because Stripe cannot control what a guest types into
   * their banking app, so the recorded figure comes from the PaymentIntent's
   * own amount_received. session.amount_total is the fallback for one case
   * only, a fetch that failed, where the two are equal by construction: a
   * customer_balance intent does not succeed until it is fully funded.
   */
  const isTransfer = link.method === "transfer" || kind === "trip_transfer";
  const det = await paymentIntentDetails(paymentIntent);
  /*
   * §270a BGB bans a surcharge on a SEPA credit transfer outright, so a
   * transfer's fee is zero and is forced to zero here rather than trusted. A
   * fee written onto a transfer row by some future bug would otherwise be
   * silently deducted from the trip's share, which is the quietest way this can
   * go wrong.
   */
  const fee = isTransfer ? 0 : Number(link.fee ?? 0);
  if (isTransfer && Number(link.fee ?? 0) !== 0) {
    console.error(`[webhook] transfer link ${linkId} carries a fee of ${link.fee} — no surcharge may stand on a SEPA transfer (§270a BGB); recording the full amount and ignoring it`);
  }
  const base = recordedAmount({
    amountReceivedCents: det?.amountReceived ?? null,
    sessionTotalCents: Number(session["amount_total"] ?? 0),
    feeEur: fee,
  });
  if (!(base > 0)) {
    console.error(`[webhook] ${kind} ${paymentIntent}: nothing to record after a fee of ${fee} — refused`);
    return;
  }
  // Near-decorative on an instant card charge, and the whole point on a
  // transfer: the link's amount was a request and this says when it was not met.
  if (Math.abs(base - Number(link.amount)) > 0.01) {
    console.warn(`[webhook] ${kind} ${paymentIntent}: charge nets ${base}, link asked ${link.amount} — recording what arrived`);
  }
  /*
   * WHEN it arrived. `new Date()` is honest to the second on a card and drifts
   * on a transfer: a webhook we 500'd for an hour, or a Stripe retry after an
   * outage, would stamp a payment days after the money landed — and
   * settleInvoices() settles oldest-first on the real payment date, so a
   * drifting date mis-settles invoices. The charge's own date first, then the
   * event's, then now. Never session.created, which is the day they opened the
   * checkout and can be three days early.
   */
  const landedAt = det?.chargeCreated != null
    ? new Date(det.chargeCreated * 1000)
    : eventCreated != null ? new Date(eventCreated * 1000) : new Date();

  const { data: booking, error: readErr } = await db.from("exp_bookings")
    .select("id, contact_id, experience_id, status, agreed_price, deposit_received, downpayment_received, final_payment_received, created_at, exp_editions(deposit,date_start), exp_packages(deposit,deposit_refund_days,downpayment_percent,final_days_before)")
    .eq("id", bookingId).maybeSingle();
  if (readErr) throw new Error(`booking read failed for ${bookingId}: ${readErr.message ?? readErr}`);
  if (!booking) { console.error(`[webhook] PAID card link but no booking ${bookingId}`); return; }

  // One row per charge, however often Stripe redelivers; two deliveries at
  // once both insert, the loser reads the winner's row back.
  /* Either reference: the webhook's own `pi_…`, or `stripe:pi_…` if the bank
     feed imported the charge first and somebody connected it by hand. That
     second row holds the GROSS the guest paid, fee included, so it is brought
     down to the trip's share rather than doubled by an insert. */
  const findRow = async () => {
    const rows = await readMany<{ id: string; reference: string; amount: number }>(
      db.from("exp_payments").select("id, reference, amount").in("reference", [paymentIntent, `stripe:${paymentIntent}`]).limit(2),
      `payment for ${paymentIntent}`,
    );
    return rows[0] ?? null;
  };
  const what = isTransfer ? "bank transfer" : "card payment";
  const existing = await findRow();
  if (existing && existing.reference !== paymentIntent && Math.abs(Number(existing.amount) - base) > 0.01) {
    await db.from("exp_payments").update({
      amount: base, provenance: "stripe", method: "stripe",
      notes: `Stripe ${what} · link ${linkId} · connected from the feed at ${Number(existing.amount).toFixed(2)}, corrected to the trip's share${fee > 0 ? `, card fee ${fee.toFixed(2)} charged on top` : ""}`,
    }).eq("id", existing.id);
  }
  let paymentId: string | null = existing?.id ?? null;
  if (!paymentId) {
    const { data: created, error: payErr } = await db.from("exp_payments").insert({
      booking_id: bookingId, contact_id: booking.contact_id, experience_id: booking.experience_id,
      amount: base, type: booking.downpayment_received ? "final" : "downpayment",
      method: "stripe", direction: "revenue", status: "paid", reference: paymentIntent,
      date: landedAt.toISOString().slice(0, 10), received_at: landedAt.toISOString(), unmatched: false,
      bank_transaction_id: null, provenance: "stripe",
      notes: `Stripe ${what} · link ${linkId} · session ${session["id"] ?? ""}${fee > 0 ? ` · card fee ${fee.toFixed(2)} charged on top, not trip revenue` : ""}`,
    }).select("id").single();
    if (payErr && payErr.code !== "23505") {
      console.error(`[webhook] PAYMENT ROW LOST for booking ${bookingId} (${paymentIntent}):`, payErr.message ?? payErr);
      throw new Error(`payment insert failed for ${bookingId}: ${payErr.message ?? payErr}`);
    }
    paymentId = (created as { id: string } | null)?.id ?? (await findRow())?.id ?? null;
  }
  // `.neq("status","paid")` so paid_at is stamped once and a redelivery cannot
  // move it. Stripe guarantees neither ordering nor once-only delivery, so
  // every status write in this file is conditional on the state it comes from.
  const closeLink = { status: "paid", paid_at: landedAt.toISOString(), payment_intent: paymentIntent, ...(paymentId ? { payment_id: paymentId } : {}) };
  const { error: closeErr } = await db.from("exp_payment_links")
    .update({ ...closeLink, amount_received: base + fee })
    .eq("id", linkId).neq("status", "paid");
  if (closeErr) {
    // amount_received arrives with migration 247. A link left open beside a
    // recorded payment would keep counting as spoken for and block the guest
    // from paying their balance, so the close must not depend on it.
    console.error(`[webhook] closing link ${linkId} failed, retrying without amount_received:`, closeErr.message ?? closeErr);
    await db.from("exp_payment_links").update(closeLink).eq("id", linkId).neq("status", "paid");
  }

  // The Stripe feed imports this same charge as a credit; tie the two now if
  // the feed got there first, and the import ties them if it comes later.
  const { linkStripeChargesToWebhookPayments } = await import("@/lib/bank/store");
  await linkStripeChargesToWebhookPayments(paymentIntent).catch((e) =>
    console.warn("[webhook] linking the Stripe credit failed (non-fatal):", e instanceof Error ? e.message : e));

  // The flags the booking page and the funnel read, brought up to what the
  // money now says, the way an admin would set them after a transfer landed.
  // All three through readMany: a read that fails here would say "nothing has
  // been paid", and the flags would be set from a total that is missing the
  // money this very webhook just recorded.
  const [pays, extras, stageDocs] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readMany<any>(db.from("exp_payments").select("amount, direction, type, status, received_at, date, created_at").eq("booking_id", bookingId), `payments on ${bookingId}`),
    readMany<{ price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null }>(
      db.from("exp_booking_addons").select("price, status, notes, payment_mode").eq("booking_id", bookingId), `add-ons on ${bookingId}`),
    readMany<{ type: string; amount: number | null }>(
      db.from("documents").select("type, amount").eq("booking_id", bookingId).eq("status", "issued").not("paid_at", "is", null).in("type", ["deposit_invoice", "downpayment_invoice"]), `settled stage invoices on ${bookingId}`),
  ]);
  const addons = extras
    .filter((a) => effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
    .reduce((n, a) => n + (Number(a.price) || 0), 0);
  const received = sumReceived(pays);
  const total = (Number(booking.agreed_price) || 0) + addons;
  const pkg = booking.exp_packages ?? {};
  // A SETTLED down-payment invoice fixes that stage's figure (the Jens Hahn
  // rule in payments.ts; the same filter the member's own plan uses), so the
  // plan is asked with what was agreed rather than a percentage of a total
  // that has grown since.
  const settled = { deposit: null as number | null, downpayment: null as number | null };
  for (const d of stageDocs) {
    if (d.type === "deposit_invoice") settled.deposit = (settled.deposit ?? 0) + (Number(d.amount) || 0);
    if (d.type === "downpayment_invoice") settled.downpayment = (settled.downpayment ?? 0) + (Number(d.amount) || 0);
  }
  const plan = computePaymentPlan(
    { deposit: booking.exp_editions?.deposit ?? pkg.deposit ?? null, deposit_refund_days: pkg.deposit_refund_days ?? null, downpayment_percent: pkg.downpayment_percent ?? null, final_days_before: pkg.final_days_before ?? null },
    { total, paidAmount: received, editionStart: booking.exp_editions?.date_start ?? null, bookedAt: booking.created_at ?? null, depositReceived: booking.deposit_received ?? null, downpaymentReceived: booking.downpayment_received ?? null, finalPaymentReceived: booking.final_payment_received ?? null, settledStages: settled },
  );
  const securing = plan.filter((m) => m.kind === "deposit" || m.kind === "downpayment").reduce((n, m) => n + m.amount, 0);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), stripe_payment_intent: paymentIntent };
  const status = String(booking.status ?? "").toLowerCase();
  /*
   * A transfer started on Monday can land on Thursday, by which time the
   * booking may have been cancelled in admin. The money is still recorded —
   * dropping it on the floor would be far worse — but nothing here resurrects
   * the booking: whether that transfer is refunded is a human's call under
   * §651h, not a webhook's. Logged at error level and noted on the link so it
   * is found rather than discovered.
   */
  const closed = status === "cancelled" || status === "lost";
  if (closed) {
    console.error(`[webhook] ${kind} ${paymentIntent}: ${base} landed on booking ${bookingId}, which is ${status}. Money recorded, booking NOT reopened — somebody has to decide about a refund.`);
    await db.from("exp_payment_links")
      .update({ note: `Money arrived after the booking was ${status}. Recorded, not applied to the booking status.` })
      .eq("id", linkId);
    /*
     * The money has to be FINDABLE, not just logged. A log line scrolls away in
     * Vercel; the payment row is where anybody looking at this booking, this
     * guest or this month's takings will actually be standing. So the reason is
     * written on the row itself, beside the amount.
     */
    if (paymentId) {
      await db.from("exp_payments").update({
        notes: `Stripe ${what} · link ${linkId} · ARRIVED AFTER THE BOOKING WAS ${status.toUpperCase()}. Recorded, not invoiced. A refund under §651h is somebody's decision to make.`,
      }).eq("id", paymentId);
    }
  } else {
    if (!booking.downpayment_received && received + 0.01 >= securing) {
      patch.downpayment_received = true;
      if (["lead", "reserved", "payment_pending"].includes(status)) patch.status = "confirmed";
    }
    if (received + 0.01 >= total) {
      patch.final_payment_received = true;
      if (["lead", "reserved", "payment_pending", "confirmed"].includes(status)) patch.status = "paid";
    }
  }
  const { error: updErr } = await db.from("exp_bookings").update(patch).eq("id", bookingId);
  if (updErr) throw new Error(`booking update failed for ${bookingId}: ${updErr.message ?? updErr}`);

  /*
   * NOT FOR A BOOKING THAT IS OVER.
   *
   * afterMoneyLanded is promoteProformaIfPaid + settleInvoices, and promotion
   * does not look at the booking's status: it mints a REAL gapless NP7-XP tax
   * invoice and emails it with "you're in" next steps. Send that to somebody
   * who cancelled and there is no tidy way back. §14 UStG means an issued
   * invoice is corrected with a Storno and a credit note, by hand, in the
   * books, not deleted.
   *
   * The money above is recorded either way. What waits is the paperwork, which
   * is the part that needs a human to say whether this guest is being refunded
   * or rebooked.
   */
  if (!closed) {
    const { afterMoneyLanded } = await import("@/lib/bank/adopt");
    await afterMoneyLanded(bookingId);
  }

  /*
   * The guess, checked against the card.
   *
   * A fee bucket is picked by whoever is talking to the guest, before anyone
   * has seen the card: a legal classification of an object they cannot inspect.
   * Stripe reports the issuing country and brand on the charge, so the guess
   * can be judged the moment the money lands, and a fee standing on a card
   * §270a protects goes straight back. Never the trip's share, only the fee.
   *
   * Best-effort on purpose: the payment is recorded and the booking is right
   * whatever happens here. A refund that fails leaves the link marked with the
   * reason, so it shows up rather than passing silently.
   */
  if (fee > 0) {
    try {
      const card = await cardForPaymentIntent(paymentIntent);
      await db.from("exp_payment_links").update({ card_country: card?.country ?? null, card_brand: card?.brand ?? null }).eq("id", linkId);
      if (!feeAllowedOnCard(card)) {
        const why = card?.country
          ? `${card.brand ?? "card"} issued in ${card.country}: no surcharge may stand on it (§270a BGB)`
          : "the card could not be identified, so the fee cannot be justified";
        const res = await refundPaymentIntent(paymentIntent, Math.round(fee * 100));
        await db.from("exp_payment_links").update({
          fee_refunded_at: res.ok ? new Date().toISOString() : null,
          fee_refund_reason: res.ok ? why : `Refund of the ${fee.toFixed(2)} fee FAILED (${res.error ?? "unknown"}), ${why}. Refund it by hand in Stripe.`,
        }).eq("id", linkId);
        console.warn(`[webhook] card fee ${fee.toFixed(2)} on ${paymentIntent}: ${res.ok ? "refunded" : "REFUND FAILED"}, ${why}`);
      } else {
        /*
         * A fee that MAY stand can still be too big. The band was chosen from
         * where we think the guest is, not from the card, so a guest with a US
         * phone paying with a UK card was quoted 3.15 % on a card that costs
         * 2.5 %. §312a Abs. 4 BGB allows the surcharge only up to what it
         * actually cost, so the excess goes back. Only ever downwards: a card
         * dearer than we quoted is NP7's own misjudgement to carry, never
         * something to bill afterwards.
         */
        const actual = cardRegionFromCard(card);
        const owed = actual ? cardFee(base, actual).fee : fee;
        const excess = Math.round((fee - owed) * 100) / 100;
        if (excess >= 0.01) {
          const why = `${card?.brand ?? "card"} issued in ${card?.country}: the ${actual} band costs ${owed.toFixed(2)}, ${fee.toFixed(2)} was charged, so ${excess.toFixed(2)} was above cost (§312a Abs. 4 BGB)`;
          const res = await refundPaymentIntent(paymentIntent, Math.round(excess * 100));
          await db.from("exp_payment_links").update({
            fee_refunded_at: res.ok ? new Date().toISOString() : null,
            fee_refund_reason: res.ok ? why : `Partial refund of ${excess.toFixed(2)} FAILED (${res.error ?? "unknown"}), ${why}. Refund it by hand in Stripe.`,
          }).eq("id", linkId);
          console.warn(`[webhook] card fee excess ${excess.toFixed(2)} on ${paymentIntent}: ${res.ok ? "refunded" : "REFUND FAILED"}, ${why}`);
        }
      }
    } catch (e) {
      console.error("[webhook] card fee check failed (payment is recorded, fee not checked):", e instanceof Error ? e.message : e);
    }
  }
}

// ─── A transfer in flight (no money yet, so no payment row anywhere here) ────

/**
 * The link row, with the booking and the guest, for a session that names one.
 * The same three checks onTripLinkPayment makes, because metadata alone is
 * never trusted with anything: the row must exist, it must belong to the
 * booking the metadata names, and its session must be this session.
 *
 * NULL MEANS ONE THING ONLY: the read worked and this session is not ours to
 * act on. A read that FAILED throws out of here (see readOne), because the two
 * used to be the same value, `const { data: link } = …`, and a caller reading
 * that null would return, the route would answer 200, and Stripe would never
 * send the event again. The columns below include three that arrive with
 * migration 247, so an unapplied or not-yet-reloaded schema is exactly the
 * failure this distinction has to survive.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function linkForSession(db: any, session: Record<string, unknown>): Promise<{ link: Record<string, unknown>; bookingId: string } | null> {
  const md = (session["metadata"] as Record<string, string> | null) ?? {};
  const linkId = md["link_id"] || null;
  const bookingId = md["booking_id"] || null;
  if (!linkId || !bookingId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await readOne<any>(
    db.from("exp_payment_links")
      .select("id, booking_id, session_id, amount, fee, status, method, instructions_url, transfer_reference")
      .eq("id", linkId).maybeSingle(),
    `link ${linkId}`,
  );
  if (!link || link.booking_id !== bookingId || (link.session_id && link.session_id !== session["id"])) {
    console.error(`[webhook] session ${session["id"]} does not match link ${linkId} on booking ${bookingId} — refused`);
    return null;
  }
  return { link, bookingId };
}

/** Booking + guest, for the mails below. Null when there is nobody to write to,
 *  and only ever that: a failed read throws, the way every read here does. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function guestForBooking(db: any, bookingId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await readOne<any>(
    db.from("exp_bookings")
      .select("id, contact_id, exp_experiences(title,currency), exp_editions(date_start,date_end), contacts(name,email)")
      .eq("id", bookingId).maybeSingle(),
    `booking ${bookingId}`,
  );
}

/**
 * The guest submitted the checkout and Stripe issued them an IBAN.
 *
 * NO MONEY HAS MOVED. payment_status is 'unpaid', the transfer has not been
 * sent yet, and recording a payment here would mark a booking confirmed against
 * money that may never come. So this function does not import exp_payments, does
 * not select from it and does not write to it, and that is structural rather
 * than a promise in a comment: the only thing it touches is the link row and the
 * mail carrying the bank details.
 *
 * The bank details are NOT on the session. hosted_instructions_url, the
 * reference and the IBAN live on the PaymentIntent's next_action, so this is
 * the one place that must fetch the intent, and it spends the full details on
 * the mail in the same breath rather than storing them: they are Stripe's
 * virtual account for that Customer and can be rotated, so a stored copy is a
 * stale copy waiting to send somebody's money to the wrong place.
 */
async function onTransferAwaiting(session: Record<string, unknown>, eventCreated?: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const found = await linkForSession(db, session);
  if (!found) return;
  const { link, bookingId } = found;
  const paymentIntent = typeof session["payment_intent"] === "string" ? (session["payment_intent"] as string) : null;
  if (!paymentIntent) {
    console.error(`[webhook] trip_transfer ${session["id"]} arrived with no payment intent — the guest has an IBAN we cannot name`);
    return;
  }

  const info = await transferInstructions(paymentIntent);
  if (!info?.hostedInstructionsUrl) {
    // Loud, because the instructions page IS the promise this feature makes. A
    // guest who closed the tab has nothing else, and the page below can only
    // apologise. Never thrown: making Stripe redeliver an event that carries no
    // money helps nobody.
    console.error(`[webhook] trip_transfer ${paymentIntent}: could not read the bank instructions from Stripe. The guest has an IBAN we cannot show them again.`);
  }

  const since = eventCreated != null ? new Date(eventCreated * 1000) : new Date();
  // open → awaiting only. A redelivered 'completed' arriving after the money
  // landed would otherwise knock a paid row back to awaiting, where it counts
  // as spoken for and blocks the guest from paying their balance.
  const { data: moved, error: updErr } = await db.from("exp_payment_links").update({
    status: "awaiting",
    payment_intent: paymentIntent,
    awaiting_since: since.toISOString(),
    funds_due_by: fundsDueBy(since).toISOString(),
    instructions_url: info?.hostedInstructionsUrl ?? null,
    transfer_reference: info?.reference ?? null,
    iban_last4: info?.iban ? String(info.iban).slice(-4) : null,
  }).eq("id", link.id).eq("status", "open").select("id");
  /*
   * THE MAIL IS THE PART THAT CANNOT BE TAKEN BACK.
   *
   * This used to log the failure and send the IBAN anyway. The guest was then
   * told precisely where to send €1,440 against a row still sitting at 'open',
   * which no guard counts as spoken for, no sweep reaches and no admin screen
   * shows as awaiting. Money moving through a bank with nothing in the
   * platform expecting it.
   *
   * So a failed write takes the mail with it and the route answers 500. Stripe
   * redelivers this event, the whole path is idempotent (the update is
   * conditional on 'open', the mail carries a dedupeKey), and a guest who gets
   * their bank details a minute late is no worse off.
   */
  if (updErr) throw new Error(`link ${link.id} could not be marked awaiting: ${updErr.message ?? updErr}`);
  /*
   * No error and no row: the link was not 'open' any more. That is a
   * redelivery, not a failure, so it must not throw, because Stripe would retry it
   * forever. But the bank details only go out again while the payment is still
   * running; on a row that has been paid, cancelled, expired or failed, sending
   * somebody an IBAN is worse than saying nothing.
   */
  if (!((moved as { id: string }[] | null)?.length)) {
    const status = String(link.status ?? "");
    if (status !== "awaiting" && status !== "part_funded") {
      console.warn(`[webhook] trip_transfer ${paymentIntent}: link ${link.id} is '${status}', not open. No instructions sent`);
      return;
    }
    console.warn(`[webhook] trip_transfer ${paymentIntent}: link ${link.id} was already '${status}'. A redelivery, nothing changed`);
  }

  const booking = await guestForBooking(db, bookingId);
  const contact = booking?.contacts;
  if (!contact?.email) return;
  const currency = (booking?.exp_experiences?.currency as string | null) ?? "EUR";
  const { sendEmail } = await import("@/lib/email/send");
  await sendEmail({
    to: contact.email,
    templateKey: "transfer_instructions",
    vars: {
      firstName: (contact.name ?? "").split(" ")[0] || undefined,
      experienceTitle: booking?.exp_experiences?.title,
      dates: fmtEventDates(booking?.exp_editions?.date_start, booking?.exp_editions?.date_end),
      amount: eur(Number(link.amount) || 0, currency),
      reference: info?.reference ?? undefined,
      iban: info?.iban ?? undefined,
      bic: info?.bic ?? undefined,
      accountHolder: info?.accountHolder ?? undefined,
      bookingLink: `${publicOrigin()}/account/bookings/${bookingId}`,
    },
    bookingId,
    contactId: booking?.contact_id,
    dedupeKey: `transfer_instructions:${link.id}`,
  }).catch(() => {});
}

/**
 * Some of the money arrived, not all of it.
 *
 * On customer_balance a PaymentIntent does not succeed until it is fully
 * funded, so a short transfer fires this and never async_payment_succeeded.
 * NOTHING is written to exp_payments, and that is correct rather than a
 * compromise: the funds are sitting in the guest's Stripe cash balance, applied
 * to nothing, and €1,400 against a €1,440 ask is not revenue. Writing it would
 * mark the securing payment met on a booking that has not made it.
 *
 * So the whole money path is already right without this handler. What it adds
 * is visibility (the shortfall on the link row) and a mail quoting the SAME
 * reference, so the top-up funds the same intent. Its absence is not fatal.
 */
async function onTransferPartlyFunded(pi: Record<string, unknown>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const piId = typeof pi["id"] === "string" ? (pi["id"] as string) : null;
  const md = (pi["metadata"] as Record<string, string> | null) ?? {};
  // The PI carries its own copy of link_id (payment_intent_data[metadata]),
  // because a PI-level event has no session on it at all. The lookup by
  // payment_intent is the fallback for an intent created before that existed,
  // or one whose awaiting write failed.
  let link: Record<string, unknown> | null = null;
  if (md["link_id"]) {
    link = await readOne<Record<string, unknown>>(
      db.from("exp_payment_links")
        .select("id, booking_id, amount, status, method, transfer_reference").eq("id", md["link_id"]).maybeSingle(),
      `link ${md["link_id"]}`,
    );
  }
  if (!link && piId) {
    const rows = await readMany<Record<string, unknown>>(
      db.from("exp_payment_links")
        .select("id, booking_id, amount, status, method, transfer_reference").eq("payment_intent", piId).limit(1),
      `link for ${piId}`,
    );
    link = rows[0] ?? null;
  }
  if (!link) {
    console.error(`[webhook] partially_funded ${piId ?? "?"} matched no payment link — money is in a cash balance with nothing pointing at it`);
    return;
  }

  const receivedCents = Number(pi["amount_received"] ?? 0);
  const received = Math.round(receivedCents) / 100;
  const asked = Number(link.amount) || 0;
  const short = Math.round((asked - received) * 100) / 100;
  /*
   * CANCELLED belongs in this list, and leaving it out lost real money.
   *
   * A guest who mistypes 140 for 1,440 and then presses "I haven't sent this
   * yet" leaves a cancelled row, and their 140 arrives a day later. Filtering
   * it out meant amount_received was never written, so the only record the
   * platform keeps of a short transfer did not exist, and the guest was then
   * emailed a shortfall notice about money we had not recorded at all.
   *
   * Money that arrived is money that arrived. The row is reopened to
   * part_funded so it is visible, counted and swept like any other, exactly as
   * linkForSession already ignores status on the full-funding path. Only a PAID
   * row is still refused, whatever order the events arrive in.
   */
  await db.from("exp_payment_links")
    .update({ status: "part_funded", amount_received: received })
    .eq("id", link.id).in("status", ["awaiting", "part_funded", "cancelled", "expired"]);
  console.warn(`[webhook] partially_funded ${piId}: ${received} of ${asked} arrived on link ${link.id}, ${short} still short`);
  if (!(short > 0.01)) return;

  const bookingId = String(link.booking_id);
  const booking = await guestForBooking(db, bookingId);
  const contact = booking?.contacts;
  if (!contact?.email) return;
  const currency = (booking?.exp_experiences?.currency as string | null) ?? "EUR";
  const { sendEmail } = await import("@/lib/email/send");
  await sendEmail({
    to: contact.email,
    templateKey: "payment_shortfall_reminder",
    vars: {
      firstName: (contact.name ?? "").split(" ")[0] || undefined,
      experienceTitle: booking?.exp_experiences?.title,
      dates: fmtEventDates(booking?.exp_editions?.date_start, booking?.exp_editions?.date_end),
      balance: eur(short, currency),
      // The SAME reference, so the top-up funds the same intent rather than
      // starting a second one nobody is watching.
      reference: (link.transfer_reference as string | null) ?? undefined,
      bookingLink: `${publicOrigin()}/account/bookings/${bookingId}`,
    },
    bookingId,
    contactId: booking?.contact_id,
    // Keyed on the amount so a redelivery of the same partial is suppressed and
    // a genuine SECOND partial, which is a different number, is not.
    dedupeKey: `transfer_shortfall:${link.id}:${Math.round(receivedCents)}`,
  }).catch(() => {});
}

// ─── The billing address the guest just typed into Checkout ─────────────────

/**
 * Keep the address Stripe collected, in the gaps we have.
 *
 * Every session NP7 creates now asks for a billing address, because a German
 * invoice over 250 euro has to carry one (§14 UStG) and 47 of the 49 we have
 * issued over that line do not. Stripe returns it on the completed session as
 * `customer_details.address`, in payment mode, whatever was paid with.
 *
 * THREE THINGS ABOUT THIS FUNCTION ARE LOAD-BEARING.
 *
 * 1. IT ONLY FILLS GAPS. Someone in admin may have typed a correct address by
 *    hand, and a guest half-filling a form on the way to paying must not be
 *    able to wipe it. fillGaps (lib/billing-address) is where that is decided,
 *    so the webhook and the trip-page ask cannot come to different conclusions
 *    about what counts as already answered.
 *
 * 2. IT CANNOT FAIL THE PAYMENT. This is bookkeeping running beside money: the
 *    whole body is wrapped, so a missing column, a schema reload or a dead
 *    connection ends in a log line and nothing else. Throwing would turn into
 *    a 500, Stripe would redeliver, and a payment that is already recorded
 *    would be reprocessed for the sake of an address. An address we did not get
 *    can be asked for again on the trip page. A payment we lost cannot.
 *
 * 3. THE READS STILL THROW. readOne is used exactly as everywhere else in this
 *    file, so a failed read is never mistaken for "this contact has no
 *    address" and never silently overwrites the decision above. The catch here
 *    swallows the throw at the outermost edge, on purpose, and says so in the
 *    log rather than pretending it worked.
 */
async function saveBillingAddress(session: Record<string, unknown>, bookingId: string): Promise<void> {
  try {
    const details = session["customer_details"] as { address?: StripeAddress | null } | null | undefined;
    const incoming = addressFromStripe(details?.address);
    // Nothing collected: an older session created before this deploy, or a
    // guest Stripe let through without one. Not a fault, and not worth a read.
    if (!Object.keys(incoming).length) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const booking = await readOne<{ contact_id: string | null; billing_contact_id: string | null }>(
      db.from("exp_bookings").select("id, contact_id, billing_contact_id").eq("id", bookingId).maybeSingle(),
      `booking ${bookingId} for its contact`,
    );
    /*
     * WHOEVER THE INVOICE IS ADDRESSED TO, which is not always the traveller.
     * An employer booking a week for an employee is exactly the case §14 UStG
     * is most about, and the invoice reads billing_contact_id when it is set.
     * Writing to the traveller instead put the company's address on a private
     * person's contact, where it could never be corrected, and left the invoice
     * with no address at all.
     */
    const contactId = booking?.billing_contact_id ?? booking?.contact_id ?? null;
    if (!contactId) return;

    const contact = await readOne<BillingAddress>(
      db.from("contacts")
        .select("id, billing_address, billing_postal_code, billing_city, billing_country")
        .eq("id", contactId).maybeSingle(),
      `contact ${contactId} billing address`,
    );
    const patch = fillGaps(contact, incoming);
    // Everything we were given is already on the contact. Touching the row to
    // change nothing would only move updated_at and make the change look like
    // an edit to whoever reads it next.
    if (!Object.keys(patch).length) return;

    const { error } = await db.from("contacts")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", contactId);
    if (error) throw new Error(error.message ?? String(error));
    console.log(`[webhook] billing address filled on contact ${contactId} from session ${session["id"]}: ${Object.keys(patch).join(", ")}`);
  } catch (e) {
    // Loud, and that is all. The money is already recorded above.
    console.error(`[webhook] could not save the billing address for booking ${bookingId} (the payment is unaffected):`, e instanceof Error ? e.message : e);
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  /* Answering 200 here was worse than failing. "received: true" tells Stripe
     the event was handled, so it never retries and the event is gone: a
     deployment with no secret would silently drop payments, balances never
     settled and deposits never recorded, while Stripe's dashboard shows every
     delivery green. A 500 makes Stripe retry with backoff for days, which is
     exactly the window in which someone notices and sets the variable. */
  if (!webhookSecret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set — refusing so Stripe retries.");
    return NextResponse.json(
      { error: "webhook not configured" },
      { status: 500 },
    );
  }

  const rawBody = await request.text();
  const sigHeader = request.headers.get("stripe-signature") ?? "";

  const valid = await verifyStripeSignature(rawBody, sigHeader, webhookSecret).catch(() => false);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; created?: number; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  /* The event's own timestamp, passed down so a payment is dated when it
     happened rather than when we got round to it. A retry after an outage can
     be hours late, and settleInvoices() settles oldest-first on the real
     payment date, so a drifting date mis-settles invoices. */
  const eventCreated = typeof event.created === "number" ? event.created : undefined;

  // Links in these mails go to the guest, so they name the real site, never
  // the host Stripe happened to call. See lib/public-origin.
  const origin = publicOrigin();

  // A card pays instantly, so completed arrives already 'paid'. SEPA Direct
  // Debit, Klarna and bank transfers — the methods an EU buyer is most likely
  // to reach for — do not: `completed` arrives with payment_status 'unpaid'
  // and the money confirms days later as async_payment_succeeded. Handling
  // only the first event means the funds land in the account and the platform
  // records nothing at all: booking still 'lead', no payment row, no member
  // account, no confirmation. Both events carry the same session and metadata,
  // and the work below is idempotent, so both are handled.
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const paymentStatus = session["payment_status"] as string | undefined;
    const metadata = (session["metadata"] as Record<string, string> | null) ?? {};
    const bookingId = metadata["booking_id"];

    const kind = metadata["kind"] ?? "";

    /*
     * FIRST IN THE BLOCK, and it used to be last.
     *
     * The branches below generate and EMAIL the invoice for this very payment.
     * Running afterwards meant the address the guest had just typed missed the
     * only document it was collected for: a clinic buyer paying in full got
     * their invoice, with its number burned and immutable under §14 UStG, and
     * the address landed a second later with nothing left to print it on.
     *
     * It is safe here because it cannot throw: saveBillingAddress swallows
     * everything and the money path below is untouched by whatever it does.
     *
     * `completed` ONLY. A bank transfer reaches this event with payment_status
     * 'unpaid' days before its money arrives, which is exactly why this is not
     * inside the paid branch: the transfer guest is the one who never types an
     * address anywhere else. async_payment_succeeded carries the same session
     * and the same address, so handling it too would be a read to write
     * nothing.
     */
    if (bookingId && event.type === "checkout.session.completed") {
      await saveBillingAddress(session, bookingId);
    }

    if (bookingId && paymentStatus === "paid") {
      try {
        if (kind.startsWith("event_")) {
          // Event tickets (deposit / full / balance) — record + confirm.
          await onEventPayment(session, kind, bookingId);
        } else if (kind === "trip_card" || kind === "trip_transfer") {
          /* A card link made by hand on the booking page, or a bank transfer
             the member started themselves. 'trip_card' stays spelled out so a
             session created before this deploy still settles.
             A transfer normally arrives here as async_payment_succeeded, days
             later. It can also arrive as 'completed' already paid, when the
             guest has enough left in their Stripe cash balance from an earlier
             over-transfer for the intent to settle instantly, and that path is
             correct with no special case: the money is real either way. */
          await onTripLinkPayment(session, bookingId, eventCreated);
        } else {
          // Trip reserve deposit flow (idempotent).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = createAdminClient() as any;
          const { data: booking, error: readErr } = await db
            .from("exp_bookings").select("id, downpayment_received").eq("id", bookingId).maybeSingle();
          if (readErr) throw new Error(`booking read failed for ${bookingId}: ${readErr.message ?? readErr}`);
          if (booking && !booking.downpayment_received) {
            await onDepositPaid(bookingId, origin);
          }
        }
      } catch (err) {
        // Swallowing this and answering 200 was the worst of both worlds: Stripe
        // marks the event delivered and NEVER retries, so a transient database
        // blip permanently loses a payment with no trace. A 500 makes Stripe
        // redeliver — and the work is idempotent (payments dedupe on the
        // payment-intent reference, mail on a dedupeKey), so a replay is safe.
        console.error(`[webhook] FAILED to record payment for booking ${bookingId} — returning 500 so Stripe retries:`, err);
        return NextResponse.json({ error: "processing failed, please retry" }, { status: 500 });
      }
    } else if (bookingId && kind === "trip_transfer" && event.type === "checkout.session.completed") {
      /*
       * THE GUEST SUBMITTED AND WAS GIVEN AN IBAN. payment_status is 'unpaid',
       * the money has not moved, and nothing about it may be recorded as a
       * payment. What must happen is the opposite of recording: write down the
       * account details so the guest can find them again, and start the clock.
       */
      try {
        await onTransferAwaiting(session, eventCreated);
      } catch (err) {
        console.error(`[webhook] FAILED to note the transfer instructions for booking ${bookingId} — returning 500 so Stripe retries:`, err);
        return NextResponse.json({ error: "processing failed, please retry" }, { status: 500 });
      }
    } else if (bookingId) {
      // Not an error — an async method simply hasn't cleared yet. Say so, so a
      // "where is my booking?" an hour after a SEPA payment has an answer in
      // the logs instead of silence.
      console.warn(`[webhook] ${event.type} for booking ${bookingId} with payment_status=${paymentStatus} — awaiting funds, nothing recorded yet`);
    } else {
      console.warn(`[webhook] ${event.type} carried no booking_id in metadata — ignored`);
    }

  }

  /*
   * Some of the transfer arrived, not all of it. A customer_balance intent does
   * not succeed until it is fully funded, so this is the only signal a short
   * transfer gives. No payment row is written on this path, which is why its
   * absence is survivable: confirm the event name in the Stripe dashboard
   * before relying on it, and nothing else may be made to depend on it.
   */
  if (event.type === "payment_intent.partially_funded") {
    try {
      await onTransferPartlyFunded(event.data.object);
    } catch (err) {
      console.error("[webhook] partially_funded handling failed (no money is at stake here, so not retried):", err);
    }
  }

  /*
   * The checkout URL died unused. Nobody submitted it, so no IBAN was ever
   * issued and there is nothing anybody could have paid. `.eq("status","open")`
   * is what keeps this harmless: an awaiting row, whose session has also
   * expired by then but whose MONEY is still moving, is untouched.
   */
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    const metadata = (session["metadata"] as Record<string, string> | null) ?? {};
    const linkId = metadata["link_id"];
    if (linkId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as any;
      await db.from("exp_payment_links")
        .update({ status: "expired", note: "The checkout link expired before it was used" })
        .eq("id", linkId).eq("status", "open");
    }
  }

  // A delayed payment that ultimately bounced. Nothing to undo — the booking
  // was never marked paid — but it must not disappear quietly: the buyer
  // believes they paid and their spot is not held.
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    const metadata = (session["metadata"] as Record<string, string> | null) ?? {};
    const bookingId = metadata["booking_id"] ?? null;
    const linkId = metadata["link_id"] ?? null;
    const reason = (session["last_payment_error"] as { message?: string } | null)?.message ?? "the bank did not complete it";
    console.error(`[webhook] async payment FAILED for booking ${bookingId ?? "?"} — buyer thinks they paid, spot is not held`);
    if (linkId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = createAdminClient() as any;
      // Anything but paid: a failure arriving after a late success must never
      // unwind a row that already has money against it.
      await db.from("exp_payment_links")
        .update({ status: "failed", note: `Stripe reported the payment failed: ${String(reason).slice(0, 240)}` })
        .eq("id", linkId).not("status", "in", "(paid,part_funded)");
    }
    if (bookingId && metadata["kind"] === "trip_transfer") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = createAdminClient() as any;
        const booking = await guestForBooking(db, bookingId);
        const contact = booking?.contacts;
        if (contact?.email) {
          const { sendEmail } = await import("@/lib/email/send");
          await sendEmail({
            to: contact.email,
            templateKey: "transfer_failed",
            vars: {
              firstName: (contact.name ?? "").split(" ")[0] || undefined,
              experienceTitle: booking?.exp_experiences?.title,
              bookingLink: `${origin}/account/bookings/${bookingId}`,
            },
            bookingId,
            contactId: booking?.contact_id,
            dedupeKey: `transfer_failed:${linkId ?? bookingId}`,
          }).catch(() => {});
        }
      } catch (err) {
        console.warn("[webhook] could not mail the failed transfer (non-fatal):", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
