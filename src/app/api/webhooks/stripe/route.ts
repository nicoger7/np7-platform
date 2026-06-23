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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const paymentStatus = session["payment_status"] as string | undefined;
    const metadata = (session["metadata"] as Record<string, string> | null) ?? {};
    const bookingId = metadata["booking_id"];

    if (bookingId && paymentStatus === "paid") {
      // Check idempotency: skip if already processed
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = createAdminClient() as any;
        const { data: booking } = await db
          .from("exp_bookings")
          .select("id, downpayment_received")
          .eq("id", bookingId)
          .maybeSingle();

        if (booking && !booking.downpayment_received) {
          await onDepositPaid(bookingId, origin).catch((err) => {
            console.error("[webhook] onDepositPaid error (non-fatal):", err);
          });
        }
      } catch (err) {
        // Non-fatal: log and still return 200 so Stripe doesn't retry infinitely
        console.error("[webhook] error processing checkout.session.completed:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
