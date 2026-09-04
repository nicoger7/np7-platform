import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { composeBookingName } from "@/lib/booking-name";
import { checkParticipant, isMinorOn } from "@/lib/minors";
import { createCheckoutSession, eur } from "@/lib/stripe";
import { eventPricing, eventDepositPlan } from "@/lib/events";
import { publicOrigin } from "@/lib/public-origin";
import { rateLimited, LIMITS } from "@/lib/rate-limit";
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
  /** Which clinic in the series the buyer is looking at (exp_editions.slug). */
  editionSlug?: string | null;
  firstName?: string; lastName?: string; email?: string; phone?: string;
  /** Participant's DOB — decides whether a guardian is legally required. */
  dob?: string | null;
  /** Adults-only runs ask for this instead of a date of birth. Only honoured
   *  when the EDITION actually says adults_only — never trusted on its own. */
  adultConfirmed?: boolean;
  guardianName?: string | null; guardianEmail?: string | null;
  guardianPhone?: string | null; guardianRelationship?: string | null;
};

const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "event-checkout", policy: LIMITS.signup });
  if (tooMany) return tooMany;

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

  const mode: "fixed" | "standby" = exp.event_mode === "standby" ? "standby" : "fixed";
  const { data: dateRows } = await db
    .from("exp_event_dates").select("id,date_start,date_end,label,status,max_spots")
    .eq("experience_id", exp.id);
  const dates = (dateRows ?? []) as { id: string; date_start: string; date_end: string | null; label: string | null; status: string; max_spots: number | null }[];

  // WHICH CLINIC is being bought — resolved before anything else, because the
  // price, the date and the booking's edition all come from it.
  //
  // This route used to read none of it: the price came from the experience
  // while the page showed the EDITION's price (migration 157 exists so a series
  // can charge differently per clinic), and a fixed-mode sale just took
  // dates[0] whatever weekend the buyer was actually looking at. With one
  // clinic those agreed by accident. With two they would not, and the buyer
  // would be charged one price for a different weekend.
  const { data: edRows } = await db
    .from("exp_editions")
    .select("id,slug,label,price,date_start,date_end,max_spots,adults_only")
    .eq("experience_id", exp.id)
    .eq("kind", "event")
    .eq("status", "published")
    .order("date_start");
  type EdRow = { id: string; slug: string | null; label: string | null; price: number | null; date_start: string | null; date_end: string | null; max_spots: number | null; adults_only?: boolean | null };
  const editions = (edRows ?? []) as EdRow[];
  const wantSlug = typeof body.editionSlug === "string" ? body.editionSlug : null;
  const today = new Date().toISOString().slice(0, 10);
  /* Only runs that have not ENDED are for sale. The fallback to editions[0]
     existed for a series whose one edition starts mid-window, but it also let
     a series whose only edition lay in the PAST keep selling it — a €100
     deposit against a balance dated before the clinic even ran. */
  const notOver = (e: EdRow) => ((e.date_end ?? e.date_start ?? "") >= today);
  const edition: EdRow | null = wantSlug
    ? editions.find((e) => e.slug === wantSlug) ?? null
    : editions.find((e) => (e.date_start ?? "") >= today) ?? editions.find(notOver) ?? null;
  if (wantSlug && !edition) return bad("That date is no longer on sale.", 409);
  if (edition && !notOver(edition)) return bad("This clinic has already run.", 409);

  // Resolve which dates this booking is against.
  let selected: string[];
  if (mode === "standby") {
    const candidateIds = new Set(dates.filter((d) => d.status === "candidate").map((d) => d.id));
    selected = (body.dateIds ?? []).filter((id) => candidateIds.has(id));
    if (selected.length === 0) return bad("Please pick at least one date you can make it.");
  } else {
    /*
     * The date row for the edition being sold — not "whichever came first".
     *
     * And if there is NO row: sell anyway. exp_event_dates is the pre-157 date
     * model; a clinic created the way the admin now instructs has an edition
     * and nothing in that table, and this used to answer 409 "no date yet" for
     * a fully priced, fully dated, fully stocked clinic. The page offered the
     * ticket and the till refused it. The edition IS the date.
     */
    const forEdition = edition?.date_start ? dates.find((d) => d.date_start === edition.date_start) : null;
    const confirmed = forEdition ?? dates.find((d) => d.status === "confirmed") ?? dates[0] ?? null;
    if (!confirmed && !edition) return bad("This event has no date yet.", 409);
    selected = confirmed ? [confirmed.id] : [];
  }

  // Minors. A form can be bypassed; this cannot. Age is judged on the day they
  // ride, and a booking for an under-18 without a named guardian is refused —
  // that contract would be voidable and the waiver worthless. This runs BEFORE
  // the contact is resolved, because who is a minor decides whose account this
  // booking belongs to.
  const eventDate = dates.find((d) => d.id === selected[0])?.date_start ?? edition?.date_start ?? null;
  const dob = typeof body.dob === "string" ? body.dob : null;
  const guardian = {
    guardianName: typeof body.guardianName === "string" ? body.guardianName.trim() : null,
    guardianEmail: typeof body.guardianEmail === "string" ? body.guardianEmail.trim() : null,
    guardianPhone: typeof body.guardianPhone === "string" ? body.guardianPhone.trim() : null,
    guardianRelationship: typeof body.guardianRelationship === "string" ? body.guardianRelationship.trim() : null,
  };
  /*
   * On an adults-only run there is no date of birth to check — the buyer
   * asserts capacity instead. The flag is re-read from the EDITION here rather
   * than taken from the request: the browser decides what to ask for, the
   * server decides what it accepts, and a posted "adultConfirmed" against a run
   * that does take juniors must not skip the guardian rules.
   */
  const adultsOnly = edition?.adults_only === true;
  const adultConfirmed = body.adultConfirmed === true;
  if (adultsOnly && !adultConfirmed) {
    return bad("Please confirm the participant is 18 or over — this clinic is for adults.", 400);
  }
  /*
   * A date of birth arrives ONLY when the buyer ticked "under 18"; its absence
   * IS the adult assertion (the client states it outright as adultConfirmed).
   * So the rule enforced here is not "everyone declares an age" but the one
   * that actually matters: a booking that NAMES a minor must name a guardian.
   *
   * Nothing more was ever being verified. A date of birth typed into a form is
   * a claim exactly like a tick-box is, so asking every adult for one bought no
   * extra certainty — it only put a field nobody needed in front of the button.
   *
   * A DOB that turns out to be 18+ passes as an adult rather than erroring:
   * someone who ticked the box by mistake should be sold a ticket, not lectured.
   */
  const declaredMinor = !adultsOnly && typeof dob === "string" && dob.trim() !== "";
  const participantProblem = declaredMinor ? checkParticipant(dob, eventDate, guardian) : null;
  if (participantProblem) return bad(participantProblem, 400);
  const minor = declaredMinor && isMinorOn(dob, eventDate) === true;

  // For a minor the GUARDIAN is the contracting party, so the account, the
  // confirmation email and the waiver invitation must reach them — not the
  // child. Without this the contact is created under whatever address the form
  // carried, and a nine-year-old ends up owning the booking their parent is
  // legally responsible for. The booking still NAMES the rider; only the
  // account and the correspondence move to the adult.
  const guardianEmail = (guardian.guardianEmail ?? "").trim().toLowerCase();
  const guardianName = (guardian.guardianName ?? "").trim();

  // Contact: logged-in member's own → reuse by email → create (mirrors /api/reserve).
  const member = await getPortalUser({ allowPreview: false }).catch(() => null);
  let firstName: string, lastName: string, email: string, phone: string;
  // A logged-in adult books for their own child: the account is already the
  // guardian's, so it stays. Only an anonymous minor booking is redirected.
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
    // Whose account this is. An adult's is their own; a minor's is their
    // guardian's, and the guardian's own name goes on it so the member area
    // greets the person who actually signed.
    const contactEmail = minor && guardianEmail ? guardianEmail : email;
    const contactName = minor && guardianName ? guardianName : fullName;
    const contactPhone = minor ? (guardian.guardianPhone ?? phone) : phone;
    // Oldest match wins, case-insensitively — the same rule auth.ts already
    // had to learn (see its comment at the contact-by-email lookup). maybeSingle()
    // ERRORS when two rows share an address, and with 13.5k imported maillist
    // contacts alongside CRM rows that is not rare. The error would be swallowed,
    // a third duplicate created, and the paid booking hung off a contact the
    // buyer's account can never resolve to — a 404 on the trip they just bought.
    const { data: existingRows } = await db.from("contacts").select("id")
      .ilike("email", contactEmail).order("created_at", { ascending: true }).limit(1);
    contactId = (existingRows as { id: string }[] | null)?.[0]?.id;
    if (!contactId) {
      const { data: created, error } = await db.from("contacts").insert({ name: contactName, email: contactEmail, phone: contactPhone, source: "website-event" }).select("id").single();
      if (error) return bad("Could not save your details. Please try again.", 500);
      contactId = created.id;
    }
  }

  // The edition's own price wins — the same rule lib/events.ts uses to build
  // the number the buyer just read on the page.
  const price = Number(edition?.price ?? exp.price);
  if (!Number.isFinite(price) || price <= 0) return bad("This event has no ticket price set.", 409);
  const { deposit } = eventPricing(price, exp.event_deposit_pct ?? 20, exp.event_refund_pct ?? 15);

  // A fixed-date clinic can still be sold as a part-payment: deposit now, the
  // rest before the weekend. That comes off the PACKAGE — the same `deposit`
  // and `final_days_before` every trip is priced from — so setting it where you
  // would expect to set it now actually does something. Stand-by keeps its own
  // percentage: its deposit answers a different question (which dates suit you)
  // and is non-refundable on different terms.
  let pkgRow: { id: string; deposit: number | null; final_days_before: number | null } | null = null;
  if (edition) {
    const { data: pkgRows } = await db
      .from("exp_packages")
      .select("id,deposit,final_days_before")
      .eq("edition_id", edition.id)
      .eq("status", "active")
      .is("archived_at", null);
    const usable = (pkgRows ?? []) as { id: string; deposit: number | null; final_days_before: number | null }[];
    pkgRow = usable.sort((a, b) => Number(a.deposit ?? Infinity) - Number(b.deposit ?? Infinity))[0] ?? null;
  }
  const plan = eventDepositPlan(price, pkgRow, edition?.date_start ?? null);

  const amount = mode === "standby" ? deposit : plan.dueNow;
  const kind = mode === "standby"
    ? "event_deposit"
    : plan.partPayment ? "event_part" : "event_full";

  const chosenLabel = mode === "standby"
    ? `standby · ${selected.length} date${selected.length > 1 ? "s" : ""}`
    : (dates.find((d) => d.id === selected[0])?.label ?? edition?.label ?? "fixed date");

  // Capacity. max_spots was read from the date row and never checked anywhere,
  // so a 12-place clinic would happily sell a 13th ticket — and the person who
  // finds out is the one standing on the beach. Count tickets that are actually
  // PAID (the webhook sets 'paid' / 'reserved'); an abandoned checkout must not
  // hold a place, because its Stripe session simply expires.
  const SOLD = ["paid", "reserved", "confirmed", "attended"];
  /*
   * ...and 'reserved' is exactly the status a STAND-BY ticket is given BEFORE
   * Stripe is even opened. So an abandoned stand-by checkout held its place for
   * ever — the seat came off sale and nothing ever put it back. The comment
   * above always said an abandoned checkout must not hold a place; the list it
   * was built from just happened to include the pre-payment state.
   *
   * An unpaid ticket THIS ROUTE created holds its seat only while its checkout
   * session could still be completed (24h, Stripe's own expiry). Anything an
   * employee entered by hand is trusted as-is — they may well have taken the
   * money by transfer — which is why the self-serve rows are identified by the
   * notes prefix only this route writes.
   */
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holdsASpot = (b: any) => {
    if (!SOLD.includes(String(b.status ?? "").toLowerCase())) return false;
    if (!String(b.notes ?? "").startsWith("Event ticket (")) return true;
    if (b.downpayment_received || b.final_payment_received) return true;
    return Date.now() - Date.parse(b.created_at) < SESSION_TTL_MS;
  };
  for (const dateId of selected) {
    const row = dates.find((d) => d.id === dateId);
    const cap = row?.max_spots ?? null;
    if (cap == null || cap <= 0) continue;
    const { data: taken } = await db
      .from("exp_bookings")
      .select("id, status, notes, created_at, downpayment_received, final_payment_received")
      .eq("experience_id", exp.id)
      .contains("event_date_ids", [dateId]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sold = ((taken ?? []) as any[]).filter(holdsASpot).length;
    if (sold >= cap) {
      return bad(row?.label ? `${row.label} is fully booked — no spots left.` : "This date is fully booked — no spots left.", 409);
    }
  }
  /*
   * A clinic with no legacy date row still has a cap, and dropping the 409
   * above must not quietly drop the capacity check with it — overselling a
   * clinic is worse than refusing to sell one, because the person who finds
   * out is standing on the beach. Count against the EDITION, which is what
   * every booking carries anyway.
   */
  if (selected.length === 0 && edition?.max_spots && edition.max_spots > 0) {
    const { data: taken } = await db
      .from("exp_bookings")
      .select("id, status, notes, created_at, downpayment_received, final_payment_received")
      .eq("edition_id", edition.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sold = ((taken ?? []) as any[]).filter(holdsASpot).length;
    if (sold >= edition.max_spots) {
      return bad(edition.label ? `${edition.label} is fully booked — no spots left.` : "This clinic is fully booked — no spots left.", 409);
    }
  }

  // The edition this ticket belongs to — already resolved above. It used to be
  // looked up again by date_start, which returned null whenever an event-date
  // row and its edition disagreed by a day, producing exactly the orphaned
  // booking migration 157 exists to prevent.
  const editionId = edition?.id ?? null;

  const fields = {
    name: composeBookingName({ contactName: fullName, experienceTitle: exp.title }),
    contact_id: contactId,
    experience_id: exp.id,
    edition_id: editionId,
    package_id: pkgRow?.id ?? null,
    status: mode === "standby" ? "reserved" : "lead",
    agreed_price: price,
    event_date_ids: selected,
    // Null on an adults-only run — there is no date to store, and the buyer's
    // 18+ assertion is recorded in the notes below so the file still shows what
    // was agreed at checkout.
    // Only a declared minor has one — an adult was never asked.
    participant_dob: declaredMinor ? dob : null,
    // For a minor the guardian is the contracting party — recorded on the
    // booking so every downstream surface (invoice, emails, waiver) knows who
    // is actually responsible, not just who rides.
    guardian_name: minor ? guardian.guardianName : null,
    guardian_email: minor ? guardian.guardianEmail : null,
    guardian_phone: minor ? guardian.guardianPhone : null,
    guardian_relationship: minor ? guardian.guardianRelationship : null,
    notes: `Event ticket (${mode})${adultsOnly ? " · confirmed 18+ at checkout (adults-only run)" : ""} · ${chosenLabel} · phone: ${phone} · ${
      mode === "standby"
        ? `deposit ${eur(amount, exp.currency)}`
        : plan.partPayment
          ? `deposit ${eur(amount, exp.currency)} of ${eur(price, exp.currency)}, balance ${eur(plan.balance, exp.currency)} due ${plan.balanceDue ?? "before the clinic"}`
          : `full ${eur(amount, exp.currency)}`
    } via Stripe`,
  };

  /*
   * One buyer, one booking — even when they come back and try again.
   *
   * The row is written BEFORE Stripe, so every abandoned checkout left a
   * booking behind: a back button, a declined card, a typo in the email, and
   * the next attempt minted a SECOND booking. Ian Black bought one clinic
   * ticket on 30 August and the platform recorded two — a 'lead' at 20:18 and
   * the paid one at 20:22. The ghost is not cosmetic: it counts in open
   * revenue, it sits in the guest list the coach reads on the beach, and the
   * lead-chasing mails go on writing to someone who has already paid.
   *
   * So look for this buyer's own unfinished attempt at this same clinic and
   * reuse it. Deliberately narrow: their contact, this experience, this
   * edition, nothing paid on it, and only a row THIS route wrote (the notes
   * prefix) — a lead an employee entered by hand is somebody's work and is
   * never overwritten. Stripe's metadata carries the same booking id either
   * way, so whichever session they end up completing lands on the same row.
   */
  let reuseId: string | null = null;
  {
    let sel = db
      .from("exp_bookings")
      .select("id, downpayment_received, final_payment_received")
      .eq("contact_id", contactId)
      .eq("experience_id", exp.id)
      .in("status", ["lead", "reserved"])
      .like("notes", "Event ticket (%")
      .order("created_at", { ascending: false })
      .limit(1);
    sel = editionId ? sel.eq("edition_id", editionId) : sel.is("edition_id", null);
    const { data: prior } = await sel;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = ((prior ?? []) as any[])[0] ?? null;
    if (row && !row.downpayment_received && !row.final_payment_received) {
      // Belt and braces: a payment row means money moved even if the booking
      // flags never got set, and that booking is not a spare to write over.
      const { data: paid } = await db.from("exp_payments").select("id").eq("booking_id", row.id).limit(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!((paid ?? []) as any[]).length) reuseId = row.id as string;
    }
  }

  let bookingId: string;
  if (reuseId) {
    const { error: uErr } = await db
      .from("exp_bookings")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", reuseId);
    if (uErr) return bad("Could not create your booking. Please try again.", 500);
    bookingId = reuseId;
  } else {
    const { data: created, error: bErr } = await db.from("exp_bookings").insert(fields).select("id").single();
    if (bErr || !created) return bad("Could not create your booking. Please try again.", 500);
    bookingId = created.id as string;
  }

  // No Stripe yet → save the booking, tell the client to expect a follow-up.
  const origin = publicOrigin();
  const session = await createCheckoutSession({
    line: {
      name: mode === "standby" || plan.partPayment ? `${exp.title} · deposit` : `${exp.title} · ticket`,
      description: mode === "standby"
        ? `Non-refundable deposit to hold your spot. Balance of ${eur(price - amount, exp.currency)} due once your date is confirmed.`
        : plan.partPayment
          ? `Deposit for your ${eur(price, exp.currency)} ticket. Balance of ${eur(plan.balance, exp.currency)} due ${plan.balanceDue ? new Date(`${plan.balanceDue}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "before the clinic"}.`
          : `Event ticket.`,
      amountCents: Math.round(amount * 100),
    },
    currency: exp.currency ?? "eur",
    successUrl: `${origin}/experience/${exp.slug}?paid=1&b=${bookingId}`,
    cancelUrl: `${origin}/experience/${exp.slug}`,
    customerEmail: email,
    metadata: { booking_id: bookingId, kind, experience_id: exp.id },
    paymentIntentDescription: `NP7 event · ${mode} · booking ${bookingId}`,
  });

  if (!session) {
    return NextResponse.json({ ok: true, noPayment: true, bookingId });
  }
  const charged = mode === "standby"
    ? `deposit ${eur(amount, exp.currency)} of ${eur(price, exp.currency)}`
    : plan.partPayment
      ? `deposit ${eur(amount, exp.currency)} of ${eur(price, exp.currency)}, balance ${eur(plan.balance, exp.currency)} due ${plan.balanceDue ?? "before the clinic"}`
      : `full ${eur(amount, exp.currency)}`;
  await db.from("exp_bookings").update({ notes: `Event ticket (${mode}) · ${chosenLabel} · phone: ${phone} · ${charged} · session ${session.id}` }).eq("id", bookingId);
  return NextResponse.json({ url: session.url });
}
