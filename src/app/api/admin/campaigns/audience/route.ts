import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { countAudience, type AudienceFilters } from "@/lib/email/campaign";

// POST /api/admin/campaigns/audience { filters } → live recipient count + sample.
// Only marketing_opt_in contacts are ever counted (enforced in countAudience).
export async function POST(request: Request) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const filters: AudienceFilters = body?.filters || {};
  try {
    const { count, sample } = await countAudience(filters);
    return NextResponse.json({ count, sample });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
