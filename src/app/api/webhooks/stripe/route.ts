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
import { generateDocument } from "@/lib/invoices/generate";
import { eur } from "@/lib/stripe";

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
    .select("id, contact_id, experience_id, status, downpayment_received, final_payment_received, exp_experiences(title,location,currency), exp_editions(date_start,date_end,location), contacts(name,email)")
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
  if (kind === "event_deposit") { patch.downpayment_received = true; patch.status = "reserved"; }
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
  if (kind === "event_full" || kind === "event_balance") {
    try {
      await generateDocument({ bookingId, type: "final_invoice" });
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
        type: kind === "event_deposit" ? "deposit" : "final",
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
    const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com";
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
    const templateKey = kind === "event_deposit" ? "event_deposit_received" : "event_ticket_confirmed";
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

// ─── Route handler ────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // Pre-config / development: no secret configured → accept and no-op
  if (!webhookSecret) {
    return NextResponse.json({ received: true, note: "no-op: STRIPE_WEBHOOK_SECRET not set" });
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

  // Derive request origin for links (portal, activation)
  const host = request.headers.get("host") ?? "";
  const origin = `https://${host}`;

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
