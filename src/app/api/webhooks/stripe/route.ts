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
import { eur, cardForPaymentIntent, refundPaymentIntent } from "@/lib/stripe";
import { feeAllowedOnCard, cardRegionFromCard, cardFee } from "@/lib/card-fee";
import { publicOrigin } from "@/lib/public-origin";
import { sumReceived } from "@/lib/payment-totals";
import { effectiveAddonStatus } from "@/lib/addons";
import { computePaymentPlan } from "@/lib/payments";
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

  // Re-fetch for side effects
  const { data: booking } = await db
    .from("exp_bookings")
    .select(
      "id, contact_id, exp_experiences(title), exp_editions(date_start,date_end), contacts(name,email)"
    )
    .eq("id", bookingId)
    .maybeSingle();

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
    dates = e ? `${d(s)} – ${d(e)} ${e.getFullYear()}` : `${d(s)} ${s.getFullYear()}`;
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
  return `${d(start, sameMonth ? { weekday: "short", day: "numeric" } : { weekday: "short", day: "numeric", month: "short" })} – ${d(end, full)}`;
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

  // supabase-js does NOT throw on a failed query — it resolves with { error }.
  // Reading only `data` made a database failure look identical to "no such
  // booking", and both quietly returned. The route then answered 200, Stripe
  // marked the event delivered, and a paid ticket was recorded nowhere with
  // nothing in any log. A real failure must THROW so the caller returns a
  // non-2xx and Stripe retries; a genuinely missing booking must not, because
  // retrying that forever is just noise.
  const { data: booking, error: readErr } = await db
    .from("exp_bookings")
    .select("id, contact_id, experience_id, status, agreed_price, downpayment_received, final_payment_received, exp_packages(final_days_before), exp_experiences(title,location,currency), exp_editions(date_start,date_end,location), contacts(name,email)")
    .eq("id", bookingId).maybeSingle();
  if (readErr) throw new Error(`booking read failed for ${bookingId}: ${readErr.message ?? readErr}`);
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
    const { data: dupRows } = await db.from("exp_payments").select("id").eq("reference", paymentIntent).limit(1);
    const dup = (dupRows as { id: string }[] | null)?.[0] ?? null;
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

// ─── Card payment on request (a link made on the booking page) ───────────────

/**
 * The guest paid a hand-made card link (kind "trip_card"). Record the trip
 * amount on the booking with provenance 'stripe', close the link, bring the
 * booking's paid flags up to date, then let the invoice engine do what it does
 * for any money landing (promote a paid pro-forma, settle invoices). The card
 * fee, if any, stays on the link row: it is not trip revenue.
 */
async function onTripCardPayment(session: Record<string, unknown>, bookingId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const md = (session["metadata"] as Record<string, string> | null) ?? {};
  const paymentIntent = typeof session["payment_intent"] === "string" ? (session["payment_intent"] as string) : null;
  const linkId = md["link_id"] || null;
  if (!paymentIntent || !linkId) {
    console.error(`[webhook] trip_card for booking ${bookingId} without a payment intent or link id — nothing recorded`);
    return;
  }
  // The link row is the record of what was asked for; the session metadata is
  // only the key to it. Anyone able to craft a session cannot make this record
  // money on a booking the link does not belong to.
  const { data: link, error: linkErr } = await db.from("exp_payment_links")
    .select("id, booking_id, session_id, amount, fee, total, status")
    .eq("id", linkId).maybeSingle();
  if (linkErr) throw new Error(`link read failed for ${linkId}: ${linkErr.message ?? linkErr}`);
  if (!link || link.booking_id !== bookingId || (link.session_id && link.session_id !== session["id"])) {
    console.error(`[webhook] trip_card session ${session["id"]} does not match link ${linkId} on booking ${bookingId} — refused`);
    return;
  }
  // What was charged, from the charge: the trip's share is the total less the
  // fee the link carried. A drift from the link's own amount is logged, but
  // the money that actually arrived is what gets recorded.
  const charged = Number(session["amount_total"] ?? 0) / 100;
  const fee = Number(link.fee ?? 0);
  const base = Math.round((charged - fee) * 100) / 100;
  if (!(base > 0)) {
    console.error(`[webhook] trip_card ${paymentIntent}: charged ${charged} less fee ${fee} leaves nothing to record — refused`);
    return;
  }
  if (Math.abs(base - Number(link.amount)) > 0.01) {
    console.warn(`[webhook] trip_card ${paymentIntent}: charge nets ${base}, link asked ${link.amount} — recording what arrived`);
  }

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
    const { data } = await db.from("exp_payments").select("id, reference, amount").in("reference", [paymentIntent, `stripe:${paymentIntent}`]).limit(2);
    return ((data as { id: string; reference: string; amount: number }[] | null) ?? [])[0] ?? null;
  };
  const existing = await findRow();
  if (existing && existing.reference !== paymentIntent && Math.abs(Number(existing.amount) - base) > 0.01) {
    await db.from("exp_payments").update({
      amount: base, provenance: "stripe", method: "stripe",
      notes: `Stripe card payment · link ${linkId} · connected from the feed at ${Number(existing.amount).toFixed(2)}, corrected to the trip's share${fee > 0 ? `, card fee ${fee.toFixed(2)} charged on top` : ""}`,
    }).eq("id", existing.id);
  }
  let paymentId: string | null = existing?.id ?? null;
  if (!paymentId) {
    const now = new Date();
    const { data: created, error: payErr } = await db.from("exp_payments").insert({
      booking_id: bookingId, contact_id: booking.contact_id, experience_id: booking.experience_id,
      amount: base, type: booking.downpayment_received ? "final" : "downpayment",
      method: "stripe", direction: "revenue", status: "paid", reference: paymentIntent,
      date: now.toISOString().slice(0, 10), received_at: now.toISOString(), unmatched: false,
      bank_transaction_id: null, provenance: "stripe",
      notes: `Stripe card payment · link ${linkId} · session ${session["id"] ?? ""}${fee > 0 ? ` · card fee ${fee.toFixed(2)} charged on top, not trip revenue` : ""}`,
    }).select("id").single();
    if (payErr && payErr.code !== "23505") {
      console.error(`[webhook] PAYMENT ROW LOST for booking ${bookingId} (${paymentIntent}):`, payErr.message ?? payErr);
      throw new Error(`payment insert failed for ${bookingId}: ${payErr.message ?? payErr}`);
    }
    paymentId = (created as { id: string } | null)?.id ?? (await findRow())?.id ?? null;
  }
  await db.from("exp_payment_links")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_intent: paymentIntent, ...(paymentId ? { payment_id: paymentId } : {}) })
    .eq("id", linkId);

  // The Stripe feed imports this same charge as a credit; tie the two now if
  // the feed got there first, and the import ties them if it comes later.
  const { linkStripeChargesToWebhookPayments } = await import("@/lib/bank/store");
  await linkStripeChargesToWebhookPayments(paymentIntent).catch((e) =>
    console.warn("[webhook] linking the Stripe credit failed (non-fatal):", e instanceof Error ? e.message : e));

  // The flags the booking page and the funnel read, brought up to what the
  // money now says, the way an admin would set them after a transfer landed.
  const [{ data: pays }, { data: extras }, { data: stageDocs }] = await Promise.all([
    db.from("exp_payments").select("amount, direction, type, status, received_at, date, created_at").eq("booking_id", bookingId),
    db.from("exp_booking_addons").select("price, status, notes, payment_mode").eq("booking_id", bookingId),
    db.from("documents").select("type, amount").eq("booking_id", bookingId).eq("status", "issued").not("paid_at", "is", null).in("type", ["deposit_invoice", "downpayment_invoice"]),
  ]);
  const addons = ((extras ?? []) as { price: number | null; status?: string | null; notes?: string | null; payment_mode?: string | null }[])
    .filter((a) => effectiveAddonStatus(a) === "confirmed" && a.payment_mode !== "direct")
    .reduce((n, a) => n + (Number(a.price) || 0), 0);
  const received = sumReceived(pays ?? []);
  const total = (Number(booking.agreed_price) || 0) + addons;
  const pkg = booking.exp_packages ?? {};
  // A SETTLED down-payment invoice fixes that stage's figure (the Jens Hahn
  // rule in payments.ts; the same filter the member's own plan uses), so the
  // plan is asked with what was agreed rather than a percentage of a total
  // that has grown since.
  const settled = { deposit: null as number | null, downpayment: null as number | null };
  for (const d of (stageDocs ?? []) as { type: string; amount: number | null }[]) {
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
  if (!booking.downpayment_received && received + 0.01 >= securing) {
    patch.downpayment_received = true;
    if (["lead", "reserved", "payment_pending"].includes(status)) patch.status = "confirmed";
  }
  if (received + 0.01 >= total) {
    patch.final_payment_received = true;
    if (["lead", "reserved", "payment_pending", "confirmed"].includes(status)) patch.status = "paid";
  }
  const { error: updErr } = await db.from("exp_bookings").update(patch).eq("id", bookingId);
  if (updErr) throw new Error(`booking update failed for ${bookingId}: ${updErr.message ?? updErr}`);

  const { afterMoneyLanded } = await import("@/lib/bank/adopt");
  await afterMoneyLanded(bookingId);

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

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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

    if (bookingId && paymentStatus === "paid") {
      try {
        if (kind.startsWith("event_")) {
          // Event tickets (deposit / full / balance) — record + confirm.
          await onEventPayment(session, kind, bookingId);
        } else if (kind === "trip_card") {
          // A card link made by hand on the booking page.
          await onTripCardPayment(session, bookingId);
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
    } else if (bookingId) {
      // Not an error — an async method simply hasn't cleared yet. Say so, so a
      // "where is my booking?" an hour after a SEPA payment has an answer in
      // the logs instead of silence.
      console.warn(`[webhook] ${event.type} for booking ${bookingId} with payment_status=${paymentStatus} — awaiting funds, nothing recorded yet`);
    } else {
      console.warn(`[webhook] ${event.type} carried no booking_id in metadata — ignored`);
    }
  }

  // A delayed payment that ultimately bounced. Nothing to undo — the booking
  // was never marked paid — but it must not disappear quietly: the buyer
  // believes they bought a ticket and their spot is not held.
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    const metadata = (session["metadata"] as Record<string, string> | null) ?? {};
    console.error(`[webhook] async payment FAILED for booking ${metadata["booking_id"] ?? "?"} — buyer thinks they paid, spot is not held`);
  }

  return NextResponse.json({ received: true });
}
