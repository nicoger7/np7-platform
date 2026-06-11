import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * Public reservation endpoint.
 *
 * Creates a contact + booking (status "payment_pending") and, when Stripe is
 * configured, a Stripe Checkout session for the €300 deposit. The thanks page
 * verifies the session and flips the booking to "downpayment_paid" — matching
 * the statuses already used by the admin bookings pipeline.
 *
 * Without STRIPE_SECRET_KEY the reservation is still saved and the team
 * follows up with a payment link personally (graceful fallback).
 */

const DEPOSIT_EUR = 300;

type Body = {
  experienceId?: string;
  editionId?: string;
  packageId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const firstName = (body.firstName ?? "").trim();
  const lastName = (body.lastName ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const phone = (body.phone ?? "").trim();
  const { experienceId, editionId, packageId } = body;

  if (!firstName || !lastName) return bad("Please fill in your name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Please enter a valid email address.");
  if (phone.replace(/[^\d+]/g, "").length < 6) return bad("Please enter a valid phone number.");
  if (!experienceId || !packageId) return bad("Missing trip selection.");

  const client = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Load + sanity-check the selection server-side (never trust client prices).
  const [{ data: exp }, { data: pkg }, { data: edition }] = await Promise.all([
    db.from("exp_experiences").select("id,title,slug,currency").eq("id", experienceId).maybeSingle(),
    db.from("exp_packages").select("id,name,price,experience_id,edition_id,status").eq("id", packageId).maybeSingle(),
    editionId
      ? db.from("exp_editions").select("id,label,date_start,date_end,experience_id").eq("id", editionId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!exp || !pkg || pkg.experience_id !== exp.id || pkg.status !== "active") {
    return bad("This package is no longer available.", 409);
  }
  if (editionId && (!edition || edition.experience_id !== exp.id)) {
    return bad("This week is no longer available.", 409);
  }

  // Contact: reuse by email, else create.
  const fullName = `${firstName} ${lastName}`;
  const { data: existing } = await db.from("contacts").select("id").eq("email", email).maybeSingle();
  let contactId = existing?.id as string | undefined;
  if (!contactId) {
    const { data: created, error: cErr } = await db
      .from("contacts")
      .insert({ name: fullName, email, phone, source: "website" })
      .select("id")
      .single();
    if (cErr) return bad("Could not save your details. Please try again.", 500);
    contactId = created.id;
  }

  // Booking — lands in the admin pipeline as "payment_pending".
  const { data: booking, error: bErr } = await db
    .from("exp_bookings")
    .insert({
      name: fullName,
      contact_id: contactId,
      experience_id: exp.id,
      edition_id: editionId ?? null,
      package_id: pkg.id,
      status: "payment_pending",
      agreed_price: pkg.price,
      notes: `Website reservation · package: ${pkg.name} · phone: ${phone} · deposit €${DEPOSIT_EUR} via Stripe`,
    })
    .select("id")
    .single();
  if (bErr) return bad("Could not create your reservation. Please try again.", 500);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    // No payment configured yet — reservation saved; team follows up personally.
    return NextResponse.json({ ok: true, noPayment: true, bookingId: booking.id });
  }

  // Stripe Checkout session for the deposit (REST API, form-encoded).
  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
  const editionLabel = edition?.label ? ` — ${edition.label}` : "";
  const params = new URLSearchParams({
    mode: "payment",
    customer_email: email,
    success_url: `${origin}/experience/${exp.slug}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/experience/${exp.slug}#packages`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(DEPOSIT_EUR * 100),
    "line_items[0][price_data][product_data][name]": `${exp.title}${editionLabel} · deposit`,
    "line_items[0][price_data][product_data][description]": `Reservation deposit for ${pkg.name}. Remaining balance due later.`,
    "metadata[booking_id]": booking.id,
    "payment_intent_data[description]": `NP7 deposit · booking ${booking.id}`,
  });

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const session = await res.json();
  if (!res.ok || !session.url) {
    console.error("stripe checkout error", session?.error?.message);
    // Reservation exists; degrade like the no-payment flow rather than losing the lead.
    return NextResponse.json({ ok: true, noPayment: true, bookingId: booking.id });
  }

  // Record the session on the booking for the thanks-page verification.
  await db
    .from("exp_bookings")
    .update({ notes: `Website reservation · package: ${pkg.name} · phone: ${phone} · deposit €${DEPOSIT_EUR} via Stripe · session ${session.id}` })
    .eq("id", booking.id);

  return NextResponse.json({ url: session.url });
}
