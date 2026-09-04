import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { createInvite, getInvitesForBooking, sendInviteEmail } from "@/lib/invites";
import { publicOrigin } from "@/lib/public-origin";
import { rateLimited, LIMITS } from "@/lib/rate-limit";
/**
 * Member-side "invite a friend to this trip".
 * GET  ?bookingId=…  → the invites the member created for their booking.
 * POST { bookingId, inviteeName?, inviteeEmail?, note? } → create an invite link.
 * Both verify the booking belongs to the signed-in member.
 */

async function ownedBooking(bookingId: string, contactId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("exp_bookings")
    .select("id, contact_id, experience_id, edition_id, package_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!data || data.contact_id !== contactId) return null;
  return data;
}

export async function GET(request: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const bookingId = new URL(request.url).searchParams.get("bookingId");
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
  if (!(await ownedBooking(bookingId, user.contactId))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const invites = await getInvitesForBooking(bookingId);
    return NextResponse.json({ invites });
  } catch {
    // Pre-migration (table absent) → behave as "no invites yet".
    return NextResponse.json({ invites: [] });
  }
}

export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "portal-invite", policy: LIMITS.write });
  if (tooMany) return tooMany;

  const user = await getPortalUser({ allowPreview: false });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { bookingId?: string; inviteeName?: string; inviteeEmail?: string; note?: string; send?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  const email = body.inviteeEmail?.trim() || null;
  if (body.send && (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return NextResponse.json({ error: "Enter a valid email to send the invite." }, { status: 400 });
  }

  const booking = await ownedBooking(body.bookingId, user.contactId);
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invite = await createInvite({
    inviterContactId: user.contactId,
    inviterBookingId: booking.id,
    experienceId: booking.experience_id ?? null,
    editionId: booking.edition_id ?? null,
    packageId: booking.package_id ?? null,
    inviterFirstName: String(user.name || "").trim().split(/\s+/)[0],
    inviteeName: body.inviteeName?.trim() || null,
    inviteeEmail: email,
    note: body.note?.trim() || null,
  });
  if (!invite) return NextResponse.json({ error: "Could not create the invite. Apply migration 050 if it's missing." }, { status: 500 });

  // Email the branded invite (with the join link) when asked. Best-effort — a
  // mail hiccup shouldn't lose the invite; the member can still copy the link.
  let emailed = false;
  if (body.send && email) {
    const origin = publicOrigin();
    try {
      const status = await sendInviteEmail(invite.id, `${origin}/join/${invite.token}`);
      emailed = status === "sent";
    } catch { /* keep the invite; report not-emailed */ }
  }

  return NextResponse.json({ invite, emailed });
}
