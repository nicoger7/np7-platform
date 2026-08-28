import { NextRequest, NextResponse } from "next/server";
import { bookingPrice } from "@/lib/tier-perks";
import { after } from "next/server";
import { checkBotId } from "botid/server";
import { resolveGearInfo, gearDelta, parseGearChoice, parseGearBaseline } from "@/lib/gear-choice";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { getPortalUser } from "@/lib/auth";
import { composeBookingName } from "@/lib/booking-name";
import { attachBookingToInvite } from "@/lib/invites";
import { getMemberTier } from "@/lib/member-tier";
import { generateDocument } from "@/lib/invoices/generate";

/**
 * Free, low-friction registration (the redesigned funnel).
 *
 * Name + email only — no phone, no payment. Creates a contact (with GDPR
 * marketing consent if opted in) and a booking in the "lead" state.
 * Sends the welcome / how-it-works email. The downpayment that actually SECURES
 * the spot happens later from the member account (Phase 2).
 *
 * Logged-in members skip the form — their verified contact is used.
 * (Bot check via Vercel BotID is wired in a follow-up.)
 */
type Body = {
  /** Booking-time extras (component ids) the guest ticked — validated
      server-side against offer_at_booking, prices come from the DB. */
  extras?: string[];
  /** Gear choice — rental (default, included) | storage | none. */
  gear?: string;
  /** Rental tier component id (upgrades beyond the base rental). */
  rentalId?: string | null;
  experienceId?: string;
  editionId?: string;
  packageId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  marketingOptIn?: boolean;
  inviteToken?: string;
  /** "reserve" (ready to book) or "info" (just wants the details first). */
  intent?: string;
  /** Honeypot — a hidden field only a script fills. */
  trap?: string;
  /** How long the form was open before submit, in ms. */
  filledMs?: number;
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  // Invisible bot check (Vercel BotID) — FLAGS, never blocks.
  //
  // It used to answer a bot verdict with a 403. A real customer signing up for
  // a €5,790 Bonaire week hit exactly that and could not register at all: the
  // classifier false-positives on ordinary people (privacy browsers, VPNs, iOS
  // Private Relay, aggressive blockers), and the page gives them no way past it.
  //
  // Registration is FREE and holds no spot, so a bot getting through costs one
  // junk lead the team deletes, while a false positive costs a real booking.
  // The verdict is therefore recorded on the lead for review instead — the
  // signal is kept, the door stays open.
  let botFlag = false;
  if (process.env.VERCEL_ENV === "production") {
    try {
      const verdict = await checkBotId();
      botFlag = "isBot" in verdict && !!verdict.isBot;
    } catch {
      /* verification unavailable → treat as human */
    }
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  // Behaviour beats fingerprinting. These two catch the bots that actually
  // show up — scripts that POST the form — and, unlike a classifier verdict,
  // a real person cannot trip them: the honeypot is invisible and unfocusable,
  // and nobody types a name and an email in under a second and a half.
  //
  // A caught honeypot gets a plain 200 with nothing written, so the script
  // sees success and never learns to adapt. The typing floor answers with a
  // retryable error instead — on the small chance a human ever hits it, the
  // second attempt is slower and simply goes through.
  if ((body.trap ?? "").trim() !== "") {
    return NextResponse.json({ ok: true });
  }
  const filledMs = Number(body.filledMs);
  // Only for hand-typed submissions: a signed-in member confirms with one
  // click off a pre-filled screen, which is legitimately instant.
  const memberProbe = await getPortalUser({ allowPreview: false }).catch(() => null);
  if (!memberProbe && Number.isFinite(filledMs) && filledMs > 0 && filledMs < 1500) {
    return bad("That went through a little too fast — please try again.", 429);
  }

  const { experienceId, editionId, packageId } = body;
  if (!experienceId || !packageId) return bad("Missing trip selection.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const member = memberProbe;

  let firstName = "", lastName = "", email = "";
  let contactId = member?.contactId as string | undefined;

  if (member && contactId) {
    const { data: c } = await db.from("contacts").select("name, email").eq("id", contactId).maybeSingle();
    const [mFirst, ...mRest] = String(c?.name ?? "").trim().split(/\s+/);
    firstName = mFirst || "";
    lastName = mRest.join(" ");
    email = (c?.email ?? member.email ?? "").toLowerCase();
  } else {
    firstName = (body.firstName ?? "").trim();
    lastName = (body.lastName ?? "").trim();
    email = (body.email ?? "").trim().toLowerCase();
    if (!firstName) return bad("Please enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Please enter a valid email address.");
  }

  // Validate the selection server-side.
  const [{ data: exp }, { data: pkg }, { data: edition }] = await Promise.all([
    db.from("exp_experiences").select("id,title,slug").eq("id", experienceId).maybeSingle(),
    db.from("exp_packages").select("id,name,price,experience_id,status,deposit,deposit_refund_days,category,gear_baseline").eq("id", packageId).maybeSingle(),
    editionId
      ? db.from("exp_editions").select("id,label,experience_id,date_start,deposit,launch_discount_pct,launch_price_until").eq("id", editionId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!exp || !pkg || pkg.experience_id !== exp.id || pkg.status !== "active") return bad("This package is no longer available.", 409);
  if (editionId && (!edition || edition.experience_id !== exp.id)) return bad("This week is no longer available.", 409);

  const fullName = `${firstName} ${lastName}`.trim();

  // Contact: member's own → reuse by email → create. Marketing consent is set
  // best-effort (column from migration 030) so registration never breaks on it.
  if (!contactId) {
    const { data: dupes } = await db.from("contacts").select("id")
      .ilike("email", email).order("created_at", { ascending: true }).limit(1);
    const existing = dupes?.[0] ?? null;
    contactId = existing?.id;
    if (!contactId) {
      const { data: created, error: cErr } = await db
        .from("contacts").insert({ name: fullName, email, source: "website-register" }).select("id").single();
      if (cErr) return bad("Could not save your details. Please try again.", 500);
      contactId = created.id;
    }
  }
  if (body.marketingOptIn && contactId) {
    await db.from("contacts").update({ marketing_opt_in: true }).eq("id", contactId).then(() => {}, () => {});
  }

  // Booking — lands as a "lead" (free signup, no payment, no spot held).
  const bookingPayload = {
    name: composeBookingName({ contactName: fullName, experienceTitle: exp.title, editionLabel: edition?.label, year: edition?.date_start ? new Date(edition.date_start).getFullYear() : null }),
    contact_id: contactId,
    experience_id: exp.id,
    edition_id: editionId ?? null,
    package_id: pkg.id,
    // Recomputed from the server's clock, exactly as /api/reserve does — the
    // picker advertises a launch or tier price, and a signup that recorded
    // full price would invoice the guest more than the page promised.
    agreed_price: (await bookingPrice(db, {
      price: pkg.price, experienceId: exp.id, editionId: editionId ?? null,
      packageId: pkg.id, edition, contactId: contactId ?? null,
      // Lounge rule: a Legend's invite link gifts the friend the Crew price.
      giftTier: await (async () => {
        const token = body.inviteToken || request.cookies.get("np7_invite")?.value;
        if (!token) return null;
        const { data: inv } = await db.from("trip_invites").select("inviter_contact_id").eq("token", token).maybeSingle();
        if (!inv?.inviter_contact_id) return null;
        const inviterTier = await getMemberTier(inv.inviter_contact_id).catch(() => null);
        return inviterTier?.key === "legend" ? ("crew" as const) : null;
      })(),
    })).price,
    notes: `Website registration · package: ${pkg.name}${body.inviteToken ? (body.intent === "info" ? " · friend invite (info request)" : " · friend invite") : ""}${botFlag ? " · ⚠ BOT-CHECK FLAGGED — verify before invoicing" : ""}`,
  };
  const { data: booking, error: bErr } = await db
    .from("exp_bookings").insert({ ...bookingPayload, status: "lead" }).select("id").single();
  if (bErr) return bad("Could not complete your registration. Please try again.", 500);

  // Gear choice (Model A): rental is included in the package price — only a
  // choice AWAY from it writes a row: ONE delta add-on referencing the real
  // component, so ops, invoices and P&L all see what happened.
  const gearBaseline = parseGearBaseline((pkg as { gear_baseline?: string | null }).gear_baseline);
  const gearChoice = parseGearChoice(body.gear ?? gearBaseline);
  const rentalId = typeof body.rentalId === "string" ? body.rentalId : null;
  if (gearChoice !== gearBaseline || (gearChoice === "rental" && rentalId)) {
    try {
      const gearInfo = await resolveGearInfo(exp.id, editionId ?? null, (pkg as { category?: string | null }).category ?? null);
      const delta = gearDelta(gearInfo, gearChoice, gearBaseline, rentalId);
      const chosenRental = (rentalId && gearInfo.rentals.find((r) => r.id === rentalId)) || gearInfo.rental;
      const comp = gearChoice === "storage" ? gearInfo.storage
        : gearChoice === "rental" ? chosenRental
        : gearInfo.rental ?? gearInfo.storage; // "none": reference what was removed
      if (comp && delta !== 0) {
        const LABELS: Record<string, string> = {
          rental: rentalId && chosenRental && chosenRental.id === rentalId && gearBaseline === "rental"
            ? `Rental upgrade — ${chosenRental.name}`
            : "Gear rental — added to the package",
          storage: gearBaseline === "rental" ? "Gear storage — included rental swapped out" : "Gear storage — added",
          none: gearBaseline === "rental" ? "Own gear — included rental removed" : "Included storage removed",
        };
        await db.from("exp_booking_addons").insert({
          booking_id: booking.id,
          component_id: comp.id,
          label: LABELS[gearChoice],
          price: delta,
          status: "confirmed",
          source: "booking",
          payment_mode: "np7",
        }).then(undefined, () => {});
      }
    } catch { /* no gear components built for this edition — nothing to record */ }
  }

  // Booking-time extras → confirmed add-on rows on the existing rails
  // (member plan, invoices and the add-on invoice all read these).
  const extraIds = Array.isArray(body.extras) ? body.extras.filter((x) => typeof x === "string").slice(0, 12) : [];
  if (extraIds.length) {
    const { data: comps } = await db
      .from("exp_components")
      .select("id,name,sell_price,payment_mode,offer_at_booking,experience_id,edition_id,is_global,archived_at")
      .in("id", extraIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = ((comps ?? []) as any[]).filter((c) =>
      c.offer_at_booking && !c.archived_at && Number(c.sell_price) > 0 &&
      (c.is_global || c.experience_id === exp.id) &&
      // The ids come from the request body, so this is the LAST line of defence
      // before a component priced for one week is billed against another. The
      // quote endpoint applies the same rule, so the two cannot disagree.
      (!c.edition_id || c.edition_id === (editionId ?? null)));
    if (valid.length) {
      await db.from("exp_booking_addons").insert(valid.map((c) => ({
        booking_id: booking.id,
        component_id: c.id,
        label: c.name,
        price: Number(c.sell_price),
        status: "confirmed",
        source: "booking",
        payment_mode: c.payment_mode ?? "np7",
      }))).then(undefined, () => {});
    }
  }

  // Referral attribution: the friend may have arrived via an invite link (token
  // in the body) OR browsed the site first (token stickied in the np7_invite
  // cookie). Either way, link the booking back to the invite (best-effort).
  const inviteToken = body.inviteToken || request.cookies.get("np7_invite")?.value;
  if (inviteToken && contactId) {
    await attachBookingToInvite(inviteToken, contactId, booking.id);
  }

  const origin = request.headers.get("origin") ?? `https://${request.headers.get("host")}`;

  // Welcome email + PRO-FORMA payment request in ONE send, generated in the
  // background so registration stays instant. The pro-forma gives the rider
  // bank details + the pay-by date the moment the clock starts — the real tax
  // invoice is only issued once money arrives (promoteProformaIfPaid), so
  // unpaid registrations never need a Storno. If PDF generation fails for any
  // reason, the welcome email still goes out (registration must never break).
  after(async () => {
    let attachments: { filename: string; content: Buffer }[] | undefined;
    try {
      const doc = await generateDocument({ bookingId: booking.id, type: "proforma_invoice" });
      const pdf = (doc as { pdf?: Buffer }).pdf;
      if (pdf) attachments = [{ filename: `${doc.invoice_number || "payment-details"}.pdf`, content: pdf }];
    } catch (e) {
      console.error("proforma generation failed (welcome email sent without it)", e instanceof Error ? e.message : e);
    }
    await sendEmail({
      to: email,
      templateKey: "reservation_received",
      vars: {
        firstName, experienceTitle: exp.title, editionLabel: edition?.label ?? undefined, bookingLink: `${origin}/account`,
        refundDays: Number(edition?.deposit ?? pkg.deposit ?? 0) > 0 ? String(pkg.deposit_refund_days ?? 14) : undefined,
      },
      bookingId: booking.id,
      contactId,
      experienceId: exp.id,
      attachments,
      dedupeKey: `registration_welcome:${booking.id}`,
    }).catch(() => {});
  });

  return NextResponse.json({ ok: true, bookingId: booking.id });
}
