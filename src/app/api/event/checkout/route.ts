import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { composeBookingName } from "@/lib/booking-name";
import { createCheckoutSession, eur } from "@/lib/stripe";
import { eventPricing } from "@/lib/events";

/**
 * Public event-ticket checkout.
 *
 * fixed   → charges 100% now (one confirmed date).
 * standby → charges the non-refundable deposit now; the buyer marks which
 *           candidate dates they can make. Balance / refund happen later when a
 *           date is confirmed in admin.
 *
 * Without STRIPE_SECRET_KEY the booking is still saved and the team follows up
 * with a payment link (graceful — never lose the lead).
 */

type Body = {
  experienceId?: string;
  dateIds?: string[];        // standby: the dates the buyer can make; fixed: [confirmed date] (optional)
  firstName?: string; lastName?: string; email?: string; phone?: string;
};

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(request: NextRequest) {
  let body: Body;
  try { body = await request.json(); } catch { return bad("Invalid request"); }
  if (!body.experienceId) return bad("Missing event.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: exp } = await db
    .from("exp_experiences")
    .select("id,title,slug,currency,price,page_template,event_mode,event_deposit_pct,event_refund_pct,status")
    .eq("id", body.experienceId).maybeSingle();
  if (!exp || exp.page_template !== "event") return bad("This event is no longer available.", 409);
  if (exp.price == null || exp.price <= 0) return bad("This event has no ticket price set.", 409);

  const mode: "fixed" | "standby" = exp.event_mode === "standby" ? "standby" : "fixed";
  const { data: dateRows } = await db
    .from("exp_event_dates").select("id,date_start,date_end,label,status")
    .eq("experience_id", exp.id);
  const dates = (dateRows ?? []) as { id: string; date_start: string; date_end: string | null; label: string | null; status: string }[];

  // Resolve which dates this booking is against.
  let selected: string[];
  if (mode === "standby") {
    const candidateIds = new Set(dates.filter((d) => d.status === "candidate").map((d) => d.id));
    selected = (body.dateIds ?? []).filter((id) => candidateIds.has(id));
    if (selected.length === 0) return bad("Please pick at least one date you can make it.");
  } else {
    const confirmed = dates.find((d) => d.status === "confirmed") ?? dates[0];
    if (!confirmed) return bad("This event has no date yet.", 409);
    selected = [confirmed.id];
  }

  // Contact: logged-in member's own → reuse by email → create (mirrors /api/reserve).
  const member = await getPortalUser({ allowPreview: false }).catch(() => null);
  let firstName: string, lastName: string, email: string, phone: string;
  let contactId = member?.contactId as string | undefined;
  if (member && contactId) {
    const { data: c } = await db.from("contacts").select("name,email,phone").eq("id", contactId).maybeSingle();
    const [f, ...r] = String(c?.name ?? "").trim().split(/\s+/);
    firstName = f || ""; lastName = r.join(" "); email = (c?.email ?? member.email ?? "").toLowerCase();
    phone = (body.phone ?? c?.phone ?? "").trim();
  } else {
    firstName = (body.firstName ?? "").trim();
    lastName = (body.lastName ?? "").trim();
    email = (body.email ?? "").trim().toLowerCase();
    phone = (body.phone ?? "").trim();
    if (!firstName || !lastName) return bad("Please fill in your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Please enter a valid email address.");
  }
  const fullName = `${firstName} ${lastName}`.trim();

  if (!contactId) {
    const { data: existing } = await db.from("contacts").select("id").eq("email", email).maybeSingle();
    contactId = existing?.id;
    if (!contactId) {
      const { data: created, error } = await db.from("contacts").insert({ name: fullName, email, phone, source: "website-event" }).select("id").single();
      if (error) return bad("Could not save your details. Please try again.", 500);
      contactId = created.id;
    }
  }

  const price = Number(exp.price);
  const { deposit } = eventPricing(price, exp.event_deposit_pct ?? 20, exp.event_refund_pct ?? 15);
  const amount = mode === "standby" ? deposit : price;
  const kind = mode === "standby" ? "event_deposit" : "event_full";

  const chosenLabel = mode === "standby"
    ? `standby · ${selected.length} date${selected.length > 1 ? "s" : ""}`
    : (dates.find((d) => d.id === selected[0])?.label ?? "fixed date");

  const { data: booking, error: bErr } = await db.from("exp_bookings").insert({
    name: composeBookingName({ contactName: fullName, experienceTitle: exp.title }),
    contact_id: contactId,
    experience_id: exp.id,
    status: mode === "standby" ? "reserved" : "lead",
    agreed_price: price,
    event_date_ids: selected,
    notes: `Event ticket (${mode}) · ${chosenLabel} · phone: ${phone} · ${mode === "standby" ? `deposit ${eur(amount, exp.currency)}` : `full ${eur(amount, exp.currency)}`} via Stripe`,
  }).select("id").single();
  if (bErr) return bad("Could not create your booking. Please try again.", 500);

  // No Stripe yet → save the booking, tell the client to expect a follow-up.
  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;
  const session = await createCheckoutSession({
    line: {
      name: mode === "standby" ? `${exp.title} · deposit` : `${exp.title} · ticket`,
      description: mode === "standby"
        ? `Non-refundable deposit to hold your spot. Balance of ${eur(price - amount, exp.currency)} due once your date is confirmed.`
        : `Event ticket.`,
      amountCents: Math.round(amount * 100),
    },
    currency: exp.currency ?? "eur",
    successUrl: `${origin}/experience/${exp.slug}?paid=1`,
    cancelUrl: `${origin}/experience/${exp.slug}`,
    customerEmail: email,
    metadata: { booking_id: booking.id, kind, experience_id: exp.id },
    paymentIntentDescription: `NP7 event · ${mode} · booking ${booking.id}`,
  });

  if (!session) {
    return NextResponse.json({ ok: true, noPayment: true, bookingId: booking.id });
  }
  await db.from("exp_bookings").update({ notes: `Event ticket (${mode}) · ${chosenLabel} · phone: ${phone} · session ${session.id}` }).eq("id", booking.id);
  return NextResponse.json({ url: session.url });
}
