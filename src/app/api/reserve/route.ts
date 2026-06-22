import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { getPortalUser } from "@/lib/auth";
import { paidSpotsByEdition, spotsLeftFrom } from "@/lib/availability";
import { composeBookingName } from "@/lib/booking-name";

/**
 * Public reservation endpoint.
 *
 * Creates a contact + booking (status "reserved") and, when Stripe is
 * configured, a Stripe Checkout session for the €300 hold-deposit. The thanks
 * page verifies the session and flips the booking to "confirmed" — the spot is
 * then secured in the admin pipeline.
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

  const { experienceId, editionId, packageId } = body;
  if (!experienceId || !packageId) return bad("Missing trip selection.");

  const client = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;

  // Logged-in member? Their verified contact is the source of truth — client-sent
  // name/email is ignored (a member only ever sees a confirm screen, no form).
  const member = await getPortalUser().catch(() => null);

  let firstName: string, lastName: string, email: string, phone: string;
  let contactId = member?.contactId as string | undefined;
  let stripeCustomerId: string | null = null;

  if (member && contactId) {
    const { data: c } = await db.from("contacts").select("name, email, phone, stripe_customer_id").eq("id", contactId).maybeSingle();
    const [mFirst, ...mRest] = String(c?.name ?? "").trim().split(/\s+/);
    firstName = mFirst || "";
    lastName = mRest.join(" ");
    email = (c?.email ?? member.email ?? "").toLowerCase();
    stripeCustomerId = c?.stripe_customer_id ?? null;
    // accept an updated phone from the confirm screen, else keep what we have
    const bodyPhone = (body.phone ?? "").trim();
    phone = bodyPhone.replace(/[^\d+]/g, "").length >= 6 ? bodyPhone : (c?.phone ?? "");
    if (phone && phone !== c?.phone) {
      await db.from("contacts").update({ phone, updated_at: new Date().toISOString() }).eq("id", contactId);
    }
  } else {
    firstName = (body.firstName ?? "").trim();
    lastName = (body.lastName ?? "").trim();
    email = (body.email ?? "").trim().toLowerCase();
    phone = (body.phone ?? "").trim();
    if (!firstName || !lastName) return bad("Please fill in your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Please enter a valid email address.");
    if (phone.replace(/[^\d+]/g, "").length < 6) return bad("Please enter a valid phone number.");
  }

  // Load + sanity-check the selection server-side (never trust client prices).
  const [{ data: exp }, { data: pkg }, { data: edition }] = await Promise.all([
    db.from("exp_experiences").select("id,title,slug,currency").eq("id", experienceId).maybeSingle(),
    db.from("exp_packages").select("id,name,price,experience_id,edition_id,status").eq("id", packageId).maybeSingle(),
    editionId
      ? db.from("exp_editions").select("id,label,date_start,date_end,experience_id,max_spots").eq("id", editionId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!exp || !pkg || pkg.experience_id !== exp.id || pkg.status !== "active") {
    return bad("This package is no longer available.", 409);
  }
  if (editionId && (!edition || edition.experience_id !== exp.id)) {
    return bad("This week is no longer available.", 409);
  }

  // Don't let a paid deposit be taken for a week that's already full. A spot is
  // only held by a SECURED booking (paid downpayment), so we count those vs the
  // cap. Best-effort, app-level: a true simultaneous double-book would need a DB
  // constraint (future migration); this stops the common over-booking case.
  if (editionId && edition?.max_spots != null) {
    const secured = await paidSpotsByEdition([editionId]);
    const left = spotsLeftFrom(edition.max_spots, secured[editionId] ?? 0);
    if (left !== null && left <= 0) {
      return bad("This week is fully booked. Please pick another week or join the waitlist.", 409);
    }
  }

  const fullName = `${firstName} ${lastName}`.trim();

  // Contact: member's own (already resolved) → reuse by email → create.
  if (!contactId) {
    const { data: existing } = await db.from("contacts").select("id, stripe_customer_id").eq("email", email).maybeSingle();
    contactId = existing?.id;
    stripeCustomerId = existing?.stripe_customer_id ?? null;
    if (!contactId) {
      const { data: created, error: cErr } = await db
        .from("contacts").insert({ name: fullName, email, phone, source: "website" }).select("id").single();
      if (cErr) return bad("Could not save your details. Please try again.", 500);
      contactId = created.id;
    }
  }

  // Booking — lands in the admin pipeline as "reserved" (awaiting the deposit).
  const { data: booking, error: bErr } = await db
    .from("exp_bookings")
    .insert({
      name: composeBookingName({ contactName: fullName, experienceTitle: exp.title, editionLabel: edition?.label, year: edition?.date_start ? new Date(edition.date_start).getFullYear() : null }),
      contact_id: contactId,
      experience_id: exp.id,
      edition_id: editionId ?? null,
      package_id: pkg.id,
      status: "reserved",
      agreed_price: pkg.price,
      notes: `Website reservation · package: ${pkg.name} · phone: ${phone} · deposit €${DEPOSIT_EUR} via Stripe`,
    })
    .select("id")
    .single();
  if (bErr) return bad("Could not create your reservation. Please try again.", 500);

  // Reservation-saved (no online payment completed) — confirm + nudge to pay.
  async function reservationSaved() {
    await sendEmail({
      to: email,
      templateKey: "reservation_received",
      vars: { firstName, experienceTitle: exp.title, editionLabel: edition?.label ?? undefined, deposit: String(DEPOSIT_EUR) },
      bookingId: booking.id,
      contactId,
      dedupeKey: `reservation_received:${booking.id}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, noPayment: true, bookingId: booking.id });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    // No payment configured yet — reservation saved; team follows up personally.
    return reservationSaved();
  }

  // Stripe Checkout session for the deposit (REST API, form-encoded).
  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
  const editionLabel = edition?.label ? ` — ${edition.label}` : "";

  // Members get a Stripe Customer so they can opt to save their card.
  if (member && !stripeCustomerId) {
    const cRes = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email, name: fullName, "metadata[contact_id]": contactId ?? "" }).toString(),
    });
    const cust = await cRes.json();
    if (cRes.ok && cust.id) {
      stripeCustomerId = cust.id;
      await db.from("contacts").update({ stripe_customer_id: stripeCustomerId }).eq("id", contactId);
    }
  }

  const params = new URLSearchParams({
    mode: "payment",
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
  if (stripeCustomerId) {
    params.set("customer", stripeCustomerId);
    // let members save their card for next time (Stripe-native consent)
    params.set("payment_method_save", "enabled");
    params.set("saved_payment_method_options[payment_method_save]", "enabled");
  } else {
    params.set("customer_email", email);
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const session = await res.json();
  if (!res.ok || !session.url) {
    console.error("stripe checkout error", session?.error?.message);
    // Reservation exists; degrade like the no-payment flow rather than losing the lead.
    return reservationSaved();
  }

  // Record the session on the booking for the thanks-page verification.
  await db
    .from("exp_bookings")
    .update({ notes: `Website reservation · package: ${pkg.name} · phone: ${phone} · deposit €${DEPOSIT_EUR} via Stripe · session ${session.id}` })
    .eq("id", booking.id);

  return NextResponse.json({ url: session.url });
}
