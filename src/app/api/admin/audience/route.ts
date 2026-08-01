import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { getAudienceOptions } from "@/lib/email/audience-bookings";
import { audienceContactIds, countAudience, type AudienceFilters } from "@/lib/email/campaign";

export const dynamic = "force-dynamic";

// GET — experiences, editions and the booking statuses actually in use.
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const options = await getAudienceOptions().catch(() => ({ experiences: [], editions: [], statuses: [] }));
  return NextResponse.json(options);
}

/**
 * POST { filters, ids? } — how many people match, and optionally who.
 *
 * `ids: true` returns the full list so the caller can stage invites. Kept behind
 * a flag so the common case (a live count while you fiddle with filters) stays
 * one cheap COUNT rather than dragging thousands of rows over the wire.
 */
export async function POST(request: NextRequest) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const filters: AudienceFilters = body?.filters || {};
  try {
    const { count, sample } = await countAudience(filters);
    const ids = body?.ids === true ? await audienceContactIds(filters) : undefined;
    return NextResponse.json({ count, sample, ids });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
