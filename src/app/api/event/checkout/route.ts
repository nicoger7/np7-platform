import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { composeBookingName } from "@/lib/booking-name";
import { checkParticipant, isMinorOn } from "@/lib/minors";
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
  /** Participant's DOB — decides whether a guardian is legally required. */
  dob?: string | null;
  guardianName?: string | null; guardianEmail?: string | null;
  guardianPhone?: string | null; guardianRelationship?: string | null;
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
    .from("exp_event_dates").select("id,date_start,date_end,label,status,max_spots")
    .eq("experience_id", exp.id);
  const dates = (dateRows ?? []) as { id: string; date_start: string; date_end: string | null; label: string | null; status: string; max_spots: number | null }[];

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

  // Minors. A form can be bypassed; this cannot. Age is judged on the day they
  // ride, and a booking for an under-18 without a named guardian is refused —
  // that contract would be voidable and the waiver worthless.
  const eventDate = dates.find((d) => d.id === selected[0])?.date_start ?? null;
  const dob = typeof body.dob === "string" ? body.dob : null;
  const guardian = {
    guardianName: typeof body.guardianName === "string" ? body.guardianName.trim() : null,
    guardianEmail: typeof body.guardianEmail === "string" ? body.guardianEmail.trim() : null,
    guardianPhone: typeof body.guardianPhone === "string" ? body.guardianPhone.trim() : null,
    guardianRelationship: typeof body.guardianRelationship === "string" ? body.guardianRelationship.trim() : null,
  };
  const participantProblem = checkParticipant(dob, eventDate, guardian);
  if (participantProblem) return bad(participantProblem, 400);
  const minor = isMinorOn(dob, eventDate) === true;

  // Capacity. max_spots was read from the date row and never checked anywhere,
  // so a 12-place clinic would happily sell a 13th ticket — and the person who
  // finds out is the one standing on the beach. Count tickets that are actually
  // PAID (the webhook sets 'paid' / 'reserved'); an abandoned checkout must not
  // hold a place, because its Stripe session simply expires.
  for (const dateId of selected) {
    const row = dates.find((d) => d.id === dateId);
    const cap = row?.max_spots ?? null;
    if (cap == null || cap <= 0) continue;
    const { data: taken } = await db
      .from("exp_bookings")
      .select("id, status")
      .eq("experience_id", exp.id)
      .contains("event_date_ids", [dateId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sold = ((taken ?? []) as any[]).filter((b) => ["paid", "reserved", "confirmed", "attended"].includes(String(b.status ?? "").toLowerCase())).length;
    if (sold >= cap) {
      return bad(row?.label ? `${row.label} is fully booked — no spots left.` : "This date is fully booked — no spots left.", 409);
    }
  }

  // The edition this ticket belongs to. Migration 157 made an event date an
  // edition, and every member and admin surface reads the edition — the trip
  // page, the bookings tab, Finance. A booking written without edition_id is
  // invisible to all of them, which is exactly the state the migration existed
  // to end, so it must be resolved here and not left to a later backfill.
  const { data: edRow } = await db
    .from("exp_editions")
    .select("id")
    .eq("experience_id", exp.id)
    .eq("kind", "event")
    .eq("date_start", eventDate)
    .maybeSingle();
  const editionId = (edRow as { id: string } | null)?.id ?? null;

  const { data: booking, error: bErr } = await db.from("exp_bookings").insert({
    name: composeBookingName({ contactName: fullName, experienceTitle: exp.title }),
    contact_id: contactId,
    experience_id: exp.id,
    edition_id: editionId,
    status: mode === "standby" ? "reserved" : "lead",
    agreed_price: price,
    event_date_ids: selected,
    participant_dob: dob,
    // For a minor the guardian is the contracting party — recorded on the
    // booking so every downstream surface (invoice, emails, waiver) knows who
    // is actually responsible, not just who rides.
    guardian_name: minor ? guardian.guardianName : null,
    guardian_email: minor ? guardian.guardianEmail : null,
    guardian_phone: minor ? guardian.guardianPhone : null,
    guardian_relationship: minor ? guardian.guardianRelationship : null,
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
    successUrl: `${origin}/experience/${exp.slug}?paid=1&b=${booking.id}`,
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
