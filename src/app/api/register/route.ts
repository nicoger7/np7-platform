import { NextRequest, NextResponse } from "next/server";
import { bookingPrice } from "@/lib/tier-perks";
import { after } from "next/server";
import { checkBotId } from "botid/server";
import { makeGearResolver, recordGearChoice, parseGearChoice, parseGearBaseline } from "@/lib/gear-choice";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { nextStepsVars } from "@/lib/email/next-steps";
import { getPortalUser } from "@/lib/auth";
import { composeBookingName } from "@/lib/booking-name";
import { validateCompanions, createCompanionBookings, MAX_COMPANIONS, type CompanionInput } from "@/lib/group-register";
import {
  appendBookingNote, classifyExistingBooking, existingBookingKind, findLiveBookings, isUniqueViolation,
  type LiveBookingRow,
} from "@/lib/existing-booking";
import { isUnchangedResubmission, type Submission } from "@/lib/resubmission";
import { getCoverer } from "@/lib/group-booking";
import { ensureMemberAccount } from "@/lib/members";
import { attachBookingToInvite } from "@/lib/invites";
import { getMemberTier } from "@/lib/member-tier";
import { generateDocument } from "@/lib/invoices/generate";
import { publicOrigin } from "@/lib/public-origin";
import { rateLimited, LIMITS } from "@/lib/rate-limit";
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
  /** Group booking: other people this payer is booking and paying for. Each
      becomes its own booking linked by covered_by_booking_id (migration 198). */
  companions?: CompanionInput[];
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "register", policy: LIMITS.signup });
  if (tooMany) return tooMany;

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
    return bad("That went through a little too fast. Please try again.", 429);
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
  const tripLabel = `${exp.title}${edition?.label ? ` · ${edition.label}` : ""}`;

  // The payer's own contact, looked up before anybody else is judged.
  //
  // Only the LOOKUP is hoisted, never the insert: moving the insert up here
  // would start leaving orphan contacts in the CRM every time a companion is
  // rejected, which today it does not. A brand new address cannot hold a
  // booking, so having no contact yet is already the answer.
  if (!contactId) {
    const { data: dupes } = await db.from("contacts").select("id")
      .ilike("email", email).order("created_at", { ascending: true }).limit(1);
    contactId = dupes?.[0]?.id;
  }

  const rawCompanions = Array.isArray(body.companions) ? body.companions.slice(0, MAX_COMPANIONS + 1) : [];

  // The gear choice (Model A): rental is included in the package price, and
  // only a choice AWAY from it writes a row. Resolved once for the whole
  // request, payer and companions alike, so one resolver in means one kind of
  // add-on row out.
  const gearBaseline = parseGearBaseline((pkg as { gear_baseline?: string | null }).gear_baseline);
  const gearChoice = parseGearChoice(body.gear ?? gearBaseline);
  const rentalId = typeof body.rentalId === "string" ? body.rentalId : null;
  const resolveGear = makeGearResolver(exp.id, editionId ?? null);

  /*
   * Booking-time extras, validated UP HERE rather than after the booking is
   * written, because the same-submission check below has to know exactly what
   * this submission would write. The rows are reused verbatim for the insert,
   * so the check costs no second query and cannot judge a different list from
   * the one that lands.
   */
  const extraIds = Array.isArray(body.extras) ? body.extras.filter((x) => typeof x === "string").slice(0, 12) : [];
  const extraRows: { component_id: string; label: string; price: number; payment_mode: string }[] = [];
  if (extraIds.length) {
    const { data: comps } = await db
      .from("exp_components")
      .select("id,name,sell_price,payment_mode,offer_at_booking,experience_id,edition_id,is_global,archived_at")
      .in("id", extraIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of ((comps ?? []) as any[]).filter((c) =>
      c.offer_at_booking && !c.archived_at && Number(c.sell_price) > 0 &&
      (c.is_global || c.experience_id === exp.id) &&
      // The ids come from the request body, so this is the LAST line of defence
      // before a component priced for one week is billed against another. The
      // quote endpoint applies the same rule, so the two cannot disagree.
      (!c.edition_id || c.edition_id === (editionId ?? null)))) {
      extraRows.push({
        component_id: c.id, label: c.name, price: Number(c.sell_price), payment_mode: c.payment_mode ?? "np7",
      });
    }
  }

  /** Everything this submission would write, for the identity check. */
  const submission: Submission = {
    experienceId: exp.id,
    editionId: editionId ?? null,
    payerEmail: email,
    companions: rawCompanions,
    payerGear: {
      gear: gearChoice, baseline: gearBaseline, rentalId,
      level: (pkg as { category?: string | null }).category ?? null,
    },
    extras: extraRows.map((r) => ({ componentId: r.component_id, price: r.price })),
    resolveGear,
  };

  type Decision =
    | { kind: "proceed" }
    | { kind: "answer"; response: NextResponse };

  /**
   * Already on this week? One helper, asked twice: once before anything is
   * validated, and again in the breath before the write.
   *
   * It runs AHEAD of the companion check on purpose: a double submit has to be
   * recognised here, or the companion gate would report the very rows the first
   * request just created back to the payer as duplicates. The identity check
   * can still run the roster rules, because it passes ignoreCoveredBy.
   */
  const decide = async (): Promise<Decision> => {
    if (!contactId) return { kind: "proceed" };
    const live = await findLiveBookings(db, {
      contactIds: [contactId], experienceId: exp.id, editionId: editionId ?? null,
    });
    const prior = live.get(contactId);
    if (!prior) return { kind: "proceed" };
    const verdict = classifyExistingBooking({ row: prior, packageId: pkg.id, now: Date.now() });
    // "none" covers a guest with no row AND a guest whose only row is an empty
    // lead. Either way this is a fresh booking, never a write to a row that was
    // already there: see classifyExistingBooking for why a public endpoint must
    // not do that.
    if (verdict === "none") return { kind: "proceed" };
    if (verdict === "same-submission") {
      // A reload or a double click, but ONLY if it would write what is already
      // there. Answering with the first booking's id lands the guest on their
      // real booking; the modal already routes on bookingId, and the welcome
      // mail cannot double-send (the first request's after() owns it under
      // dedupeKey registration_welcome:<bookingId>). A resubmission that
      // changed anything falls through to the conflict below instead of
      // dropping the change behind a success screen.
      const same = await isUnchangedResubmission(db, { prior, submission });
      if (same.identical) {
        return {
          kind: "answer",
          response: NextResponse.json({ ok: true, bookingId: prior.id, already: true, companions: same.companions }),
        };
      }
    }
    // Detail only for the person it is about. /api/register takes any address a
    // caller types, so a 409 that named the status would answer "is this person
    // going on Bonaire Week III" for anyone who asks, and a booking id is a
    // bearer token on event experiences (experience/[slug]/balance).
    const owns = !!member && member.contactId === prior.contact_id;
    if (!owns) {
      return {
        kind: "answer",
        response: NextResponse.json({
          error: "There's already a registration for this email on this week. Check your inbox for your trip page, or get a fresh link.",
          code: "already_booked",
          conflict: { kind: "unknown", tripLabel },
        }, { status: 409 }),
      };
    }
    const kind = existingBookingKind(prior);
    const payerName = kind === "covered"
      ? (await getCoverer(db, prior.id).catch(() => null))?.payerName ?? undefined
      : undefined;
    return {
      kind: "answer",
      response: NextResponse.json({
        error: "You already have a booking for this week. Open it in your account to pick up where you left off.",
        code: "already_booked",
        conflict: { kind, tripLabel, bookingId: prior.id, payerName },
      }, { status: 409 }),
    };
  };

  const firstLook = await decide();
  if (firstLook.kind === "answer") return firstLook.response;

  // Group booking: validate every companion against THIS experience and week
  // before a single row is written — a rejected companion must not leave the
  // payer with a half-created group.
  const companionCheck = await validateCompanions(db, rawCompanions, {
    experienceId: exp.id, editionId: editionId ?? null, payerEmail: email,
  });
  if (!companionCheck.ok) {
    // Already-on-this-week is the one companion failure the modal can act on
    // per row, so it travels as a 409 with the person's index. Everything else
    // stays the plain 400 it has always been.
    if (companionCheck.blocked) {
      return NextResponse.json({
        error: companionCheck.error,
        code: "already_booked",
        conflict: { kind: "companion", ...companionCheck.blocked },
      }, { status: 409 });
    }
    return bad(companionCheck.error, 400);
  }
  const companions = companionCheck.companions;

  // Contact: member's own → reuse by email (above) → create. Marketing consent
  // is set best-effort (column from migration 030) so registration never breaks.
  if (!contactId) {
    const { data: created, error: cErr } = await db
      .from("contacts").insert({ name: fullName, email, source: "website-register" }).select("id").single();
    if (cErr) return bad("Could not save your details. Please try again.", 500);
    contactId = created.id;
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
    notes: `Website registration · package: ${pkg.name}${body.inviteToken ? (body.intent === "info" ? " · friend invite (info request)" : " · friend invite") : ""}${botFlag ? " · ⚠ BOT-CHECK FLAGGED · verify before invoicing" : ""}`,
  };
  /*
   * Asked again, in the breath before the write.
   *
   * The guard above ran before validation, tier pricing and contact creation,
   * which is hundreds of milliseconds of window in which a second request can
   * pass the same guard and insert the same booking. Re-deciding here does not
   * CLOSE that race (only the unique index in migration 246 can, and it is not
   * applied yet) but it shrinks the window to a few milliseconds.
   */
  const gate = await decide();
  if (gate.kind === "answer") return gate.response;

  let bookingId: string;
  {
    const { data: booking, error: bErr } = await db
      .from("exp_bookings").insert({ ...bookingPayload, status: "lead" }).select("id").single();
    if (booking) {
      bookingId = booking.id;
    } else if (isUniqueViolation(bErr)) {
      // Migration 246 refused a second live booking on this week, so a racing
      // request won. Same question, same answer: an identical resubmission gets
      // that booking, a changed one gets the warm screen. Deliberately NOT a
      // blanket 200, which would put back the silent drop this change removes.
      const raced = await decide();
      if (raced.kind === "answer") return raced.response;
      return bad("Could not complete your registration. Please try again.", 500);
    } else {
      return bad("Could not complete your registration. Please try again.", 500);
    }
  }

  // The companions become their own bookings, covered by this one. Created
  // BEFORE the pro-forma runs in after(), so the payer's document already
  // pools the whole group.
  const createdCompanions = companions.length
    ? await createCompanionBookings(db, companions, {
        payerBookingId: bookingId,
        payerName: fullName,
        experienceId: exp.id,
        experienceTitle: exp.title,
        editionId: editionId ?? null,
        editionLabel: edition?.label ?? null,
        editionStart: edition?.date_start ?? null,
        edition,
        botFlag,
        resolveGear,
      })
    : [];

  // Gear choice (Model A): rental is included in the package price — only a
  // choice AWAY from it writes a row: ONE delta add-on referencing the real
  // component, so ops, invoices and P&L all see what happened.
  await recordGearChoice(db, {
    bookingId,
    level: submission.payerGear.level,
    gear: gearChoice,
    baseline: gearBaseline,
    rentalId,
    resolve: resolveGear,
  });

  // Booking-time extras → confirmed add-on rows on the existing rails
  // (member plan, invoices and the add-on invoice all read these). Validated
  // far above, so what lands is exactly what the identity check was shown.
  if (extraRows.length) {
    await db.from("exp_booking_addons").insert(extraRows.map((r) => ({
      booking_id: bookingId,
      component_id: r.component_id,
      label: r.label,
      price: r.price,
      status: "confirmed",
      source: "booking",
      payment_mode: r.payment_mode,
    }))).then(undefined, () => {});
  }

  // Referral attribution: the friend may have arrived via an invite link (token
  // in the body) OR browsed the site first (token stickied in the np7_invite
  // cookie). Either way, link the booking back to the invite (best-effort).
  const inviteToken = body.inviteToken || request.cookies.get("np7_invite")?.value;
  if (inviteToken && contactId) {
    await attachBookingToInvite(inviteToken, contactId, bookingId);
  }

  const origin = publicOrigin();

  // Welcome email + PRO-FORMA payment request in ONE send, generated in the
  // background so registration stays instant. The pro-forma gives the rider
  // bank details + the pay-by date the moment the clock starts — the real tax
  // invoice is only issued once money arrives (promoteProformaIfPaid), so
  // unpaid registrations never need a Storno. If PDF generation fails for any
  // reason, the welcome email still goes out (registration must never break).
  after(async () => {
    let attachments: { filename: string; content: Buffer }[] | undefined;
    try {
      const doc = await generateDocument({ bookingId, type: "proforma_invoice" });
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
        // The crew chat date, the trip page, WhatsApp for questions, and the
        // add-ons this trip actually offers. All derived, none typed.
        ...(await nextStepsVars({ experienceId: exp.id, editionId: edition?.id ?? null, packageId: pkg.id, origin })),
      },
      bookingId,
      contactId,
      experienceId: exp.id,
      attachments,
      dedupeKey: `registration_welcome:${bookingId}`,
    }).catch(() => {});

    // Each covered guest gets their own member account + a mail that says who
    // is paying and links straight to their trip page. Never a payment ask —
    // the money lives on the payer's booking.
    for (const c of createdCompanions) {
      try {
        const acc = await ensureMemberAccount({
          contactId: c.contactId, email: c.email, origin, next: `/account/bookings/${c.bookingId}`,
        });
        await sendEmail({
          to: c.email,
          templateKey: "group_spot_covered",
          vars: {
            firstName: c.firstName,
            inviterName: firstName,
            experienceTitle: exp.title,
            editionLabel: edition?.label ?? undefined,
            packageName: c.packageName,
            activationLink: "link" in acc ? acc.link : `${origin}/account`,
          },
          bookingId: c.bookingId,
          contactId: c.contactId,
          experienceId: exp.id,
          dedupeKey: `group_covered:${c.bookingId}`,
        }).catch(() => {});
      } catch { /* one companion's mail must never break the rest */ }
    }
  });

  return NextResponse.json({ ok: true, bookingId, companions: createdCompanions.map((c) => ({ firstName: c.firstName, email: c.email })) });
}
