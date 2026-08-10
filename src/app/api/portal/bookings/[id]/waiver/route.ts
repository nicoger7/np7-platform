import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getPortalUser } from "@/lib/auth";
import { WAIVER_VERSION, DEFAULT_WAIVER, renderWaiver, waiverCompanyVars } from "@/lib/waiver";
import { after } from "next/server";
import { r2Enabled, uploadToR2 } from "@/lib/r2";
import { isMinorOn } from "@/lib/minors";

/**
 * POST /api/portal/bookings/[id]/waiver  { name, signature?, agree }
 * Member signs the waiver for their own booking. Stores the signature + an audit
 * trail (name, timestamp, IP, browser, waiver version). One signature per booking.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { name?: string; signature?: string | null; agree?: boolean; guardianRelationship?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request." }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Please type your full name." }, { status: 400 });
  if (body.agree !== true) return NextResponse.json({ error: "Please confirm you agree." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: booking } = await db
    .from("exp_bookings")
    .select("id, contact_id, participant_dob, guardian_name, guardian_relationship, event_date_ids, exp_experiences(title, waiver_text), exp_editions(date_start, date_end), contacts(name)")
    .eq("id", id)
    .maybeSingle();
  if (!booking || booking.contact_id !== user.contactId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  /**
   * Who is allowed to sign this one.
   *
   * A minor's signature waives nothing (§§104–113 BGB), so for an under-18
   * booking the waiver must come from the guardian recorded at checkout — and
   * be stored as such. Anything else looks like a signed waiver and isn't one,
   * which is worse than none because it invites the assumption of cover.
   */
  let eventStart: string | null = booking.exp_editions?.date_start ?? null;
  if (!eventStart && Array.isArray(booking.event_date_ids) && booking.event_date_ids.length) {
    const { data: ed } = await db.from("exp_event_dates").select("date_start").in("id", booking.event_date_ids).order("date_start").limit(1).maybeSingle();
    eventStart = ed?.date_start ?? null;
  }
  const minor = isMinorOn(booking.participant_dob, eventStart) === true;
  if (minor && !(booking.guardian_name ?? "").trim()) {
    return NextResponse.json({ error: "This booking is for a participant under 18 and has no guardian on file — please contact us before signing." }, { status: 409 });
  }
  const signedAs = minor ? "guardian" : "participant";
  const guardianRelationship = minor
    ? ((body.guardianRelationship ?? "").trim() || booking.guardian_relationship || null)
    : null;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  /**
   * Store the EXACT wording they agreed to, not just a version number.
   *
   * The waiver is editable per experience, so the text on screen today may not
   * be the text on screen next season. Keeping only `version` meant that after
   * any edit there was no way to show what a given person actually accepted —
   * which is the one question a waiver exists to answer. Rendered here from the
   * same inputs the signing page used, so what we keep is what they read.
   */
  let waiverText: string | null = null;
  try {
    const { data: cs } = await db.from("company_settings").select("*").eq("division", "experience").maybeSingle();
    const fullName = String(booking.contacts?.name ?? name).trim();
    const [firstName, ...rest] = fullName.split(/\s+/);
    const ed = booking.exp_editions;
    const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
    waiverText = renderWaiver(booking.exp_experiences?.waiver_text || DEFAULT_WAIVER, {
      ...waiverCompanyVars(cs),
      firstName: firstName || "",
      lastName: rest.join(" "),
      experienceTitle: booking.exp_experiences?.title ?? "your trip",
      dates: ed ? [fmt(ed.date_start), fmt(ed.date_end)].filter(Boolean).join(" – ") : "",
      signedDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    });
  } catch {
    /* never block a signature over the archive copy — version still identifies it */
  }

  const signedAtIso = new Date().toISOString();
  // NB: experience_id is intentionally omitted — it's derivable from booking_id
  // and isn't present on every applied schema version. booking_id is the key.
  const { error } = await db.from("exp_waiver_signatures").upsert({
    booking_id: id,
    contact_id: booking.contact_id,
    version: WAIVER_VERSION,
    signed_name: name,
    signature_image: typeof body.signature === "string" ? body.signature : null,
    waiver_text: waiverText,
    signed_at: signedAtIso,
    signed_as: signedAs,
    guardian_relationship: guardianRelationship,
    ip,
    user_agent: ua,
  }, { onConflict: "booking_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Render the PDF AFTER responding — a signature must never fail because a
  // document generator did. The row is already the legal record; the file is
  // the readable, attachable form of it.
  const signedAt = signedAtIso;
  after(async () => {
    if (!waiverText) return; // nothing archived = nothing honest to render
    try {
      const { renderWaiverPdf } = await import("@/lib/waiver-pdf");
      const ed = booking.exp_editions;
      const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
      const { data: cs } = await db.from("company_settings").select("legal_name, company_name").eq("division", "experience").maybeSingle();
      const { pdf, hash } = await renderWaiverPdf({
        waiverText,
        signedName: name,
        signatureImage: typeof body.signature === "string" ? body.signature : null,
        signedAt,
        ip, userAgent: ua,
        version: WAIVER_VERSION,
        experienceTitle: booking.exp_experiences?.title ?? "NP7 trip",
        dates: ed ? [fmt(ed.date_start), fmt(ed.date_end)].filter(Boolean).join(" – ") : "",
        bookingRef: id,
        companyName: cs?.legal_name || cs?.company_name || "NP7",
      });
      const patch: Record<string, unknown> = { document_sha256: hash };
      if (r2Enabled()) {
        patch.document_url = await uploadToR2(pdf, `waivers/${id}.pdf`, "application/pdf");
      }
      await db.from("exp_waiver_signatures").update(patch).eq("booking_id", id);
    } catch (e) {
      console.error("waiver pdf failed (signature is still recorded)", e instanceof Error ? e.message : e);
    }
  });

  return NextResponse.json({ ok: true });
}
