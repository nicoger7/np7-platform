import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { getCoverer } from "@/lib/group-booking";
import { findLiveBookings, existingBookingKind, isEmptyLead } from "@/lib/existing-booking";
import { rateLimited, LIMITS } from "@/lib/rate-limit";

/**
 * "Am I already on this week?" for a signed-in member, asked before they type.
 *
 * The registration modal opens pre-filled for a member, so without this they
 * would fill in a group, press the button and only then learn they booked this
 * week in March. The warning belongs before the form, not after the submit.
 *
 * It takes a week and NOTHING ELSE. Identity comes from the session, which is
 * what keeps this from becoming a lookup for whether a named person is going on
 * a given trip: there is no address to type. No session is answered with a
 * plain "found: false", the same answer a member with no booking gets.
 */
export async function GET(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "register-existing", policy: LIMITS.write });
  if (tooMany) return tooMany;

  const member = await getPortalUser().catch(() => null);
  if (!member) return NextResponse.json({ found: false });

  const sp = request.nextUrl.searchParams;
  const experienceId = sp.get("experienceId") || "";
  const editionId = sp.get("editionId") || "";
  if (!experienceId) return NextResponse.json({ found: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const live = await findLiveBookings(db, {
    contactIds: [member.contactId], experienceId, editionId: editionId || null,
  });
  const row = live.get(member.contactId);
  if (!row) return NextResponse.json({ found: false });
  /*
   * A lead with no package is "tell me when this week goes live", and this
   * member is here doing exactly that. Answering "found" would replace the form
   * with a warm screen and send her to a payment page for a booking with no
   * package and no price, before she ever got to register. /api/register
   * completes that row in place instead.
   */
  if (isEmptyLead(row)) return NextResponse.json({ found: false });

  const kind = existingBookingKind(row);
  const payerName = kind === "covered"
    ? (await getCoverer(db, row.id).catch(() => null))?.payerName ?? undefined
    : undefined;
  return NextResponse.json({ found: true, kind, bookingId: row.id, payerName });
}
