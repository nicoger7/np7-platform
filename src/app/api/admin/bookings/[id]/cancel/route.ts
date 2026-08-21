import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";

/**
 * Cancel a booking. Never automatic — a human always does this.
 *
 * Body: { initiator: "customer" | "np7", reason?: string, sendEmail?: boolean }
 *
 * Two different events, deliberately not merged: a customer REQUEST that we
 * confirm, and a cancellation WE make (no-show, non-payment, trip pulled). They
 * leave different notes, and the confirmation email only makes sense for the
 * first — so the caller says explicitly whether to send it. Older callers that
 * post no body still get the previous behaviour (customer request + email).
 *
 * Sets the booking to "lost" and stamps the record. Refunds/credits are handled
 * personally, not here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const initiator = body.initiator === "np7" ? "np7" : "customer";
  const releaseRoom = body.releaseRoom === true;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  // default true keeps the old one-button behaviour for any caller without a body
  const sendMail = body.sendEmail !== false;
  if (initiator === "np7" && !reason) {
    return NextResponse.json({ error: "A reason is required when NP7 cancels the booking." }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: b } = await db
    .from("exp_bookings")
    .select("id,status,notes,contact_id,experience_id,contacts(name,email),exp_experiences(title),exp_editions(date_start,date_end)")
    .eq("id", id)
    .maybeSingle();
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  // Say WHO ended the booking. Filing an NP7-side cancellation as "confirmed"
  // reads, months later, as though the customer had asked for it.
  const note = initiator === "np7"
    ? `[CANCELLED BY NP7 ${stamp}] ${reason}`
    : `[CANCELLATION CONFIRMED ${stamp} by team — customer request]`;
  const notes = b.notes ? `${b.notes}\n${note}` : note;
  const { error } = await db.from("exp_bookings").update({ status: "lost", notes }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Optionally hand the bed back: the guest's room-weeks become available again.
  // Best-effort — a failed release must not undo the cancellation.
  if (releaseRoom) {
    await db.from("exp_hotel_rooms").update({
      booking_id: null, status: "available", hotel_confirmed: false, hotel_confirmed_at: null,
      check_in: null, check_out: null, transfer_need: false, partner_tag_along: null,
      updated_at: new Date().toISOString(),
    }).eq("booking_id", id).is("archived_at", null).then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res: any) => { if (res?.error) console.error("[cancel] room release failed:", res.error.message); }
    );
  }

  // Email the member (best-effort — never fails the cancellation), and only
  // when the team asked for it. NOTE: cancellation_confirmed is on the
  // soft-launch allowlist, so this really does reach the customer today.
  if (sendMail && b.contacts?.email) {
    const s = b.exp_editions?.date_start as string | null;
    const e = b.exp_editions?.date_end as string | null;
    const fmt = (x: string) => new Date(x).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const dates = s ? (e ? `${fmt(s)} – ${fmt(e)} ${new Date(e).getFullYear()}` : `${fmt(s)} ${new Date(s).getFullYear()}`) : undefined;
    await sendEmail({
      to: b.contacts.email,
      templateKey: "cancellation_confirmed",
      vars: { firstName: String(b.contacts.name ?? "").split(" ")[0] || "there", experienceTitle: b.exp_experiences?.title, dates },
      bookingId: id,
      contactId: b.contact_id,
      dedupeKey: `cancellation_confirmed:${id}`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, initiator, emailed: sendMail && !!b.contacts?.email });
}
