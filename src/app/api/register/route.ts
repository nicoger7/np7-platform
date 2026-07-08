import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { checkBotId } from "botid/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { getPortalUser } from "@/lib/auth";
import { composeBookingName } from "@/lib/booking-name";
import { attachBookingToInvite } from "@/lib/invites";
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
};

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  // Invisible bot check (Vercel BotID). Registration is FREE and holds no spot,
  // so a verification hiccup must never block a real person — only block a
  // confirmed bot on the live production deployment, and fail OPEN on any error
  // or when BotID isn't fully enabled (e.g. preview deploys).
  if (process.env.VERCEL_ENV === "production") {
    try {
      const verdict = await checkBotId();
      if ("isBot" in verdict && verdict.isBot) return bad("Couldn't verify your request. Please try again.", 403);
    } catch {
      /* verification unavailable → allow through */
    }
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const { experienceId, editionId, packageId } = body;
  if (!experienceId || !packageId) return bad("Missing trip selection.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const member = await getPortalUser({ allowPreview: false }).catch(() => null);

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
    db.from("exp_packages").select("id,name,price,experience_id,status").eq("id", packageId).maybeSingle(),
    editionId
      ? db.from("exp_editions").select("id,label,experience_id,date_start").eq("id", editionId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!exp || !pkg || pkg.experience_id !== exp.id || pkg.status !== "active") return bad("This package is no longer available.", 409);
  if (editionId && (!edition || edition.experience_id !== exp.id)) return bad("This week is no longer available.", 409);

  const fullName = `${firstName} ${lastName}`.trim();

  // Contact: member's own → reuse by email → create. Marketing consent is set
  // best-effort (column from migration 030) so registration never breaks on it.
  if (!contactId) {
    const { data: existing } = await db.from("contacts").select("id").eq("email", email).maybeSingle();
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
    agreed_price: pkg.price,
    notes: `Website registration · package: ${pkg.name}${body.inviteToken ? (body.intent === "info" ? " · friend invite (info request)" : " · friend invite") : ""}`,
  };
  const { data: booking, error: bErr } = await db
    .from("exp_bookings").insert({ ...bookingPayload, status: "lead" }).select("id").single();
  if (bErr) return bad("Could not complete your registration. Please try again.", 500);

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
      vars: { firstName, experienceTitle: exp.title, editionLabel: edition?.label ?? undefined, bookingLink: `${origin}/account` },
      bookingId: booking.id,
      contactId,
      experienceId: exp.id,
      attachments,
      dedupeKey: `registration_welcome:${booking.id}`,
    }).catch(() => {});
  });

  return NextResponse.json({ ok: true, bookingId: booking.id });
}
