import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { createInvite, getInvitesForBooking } from "@/lib/invites";

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
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { bookingId?: string; inviteeName?: string; inviteeEmail?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

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
    inviteeEmail: body.inviteeEmail?.trim() || null,
    note: body.note?.trim() || null,
  });
  if (!invite) return NextResponse.json({ error: "Could not create the invite. Apply migration 050 if it's missing." }, { status: 500 });

  return NextResponse.json({ invite });
}
