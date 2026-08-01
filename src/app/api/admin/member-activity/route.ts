import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { getMemberActivity } from "@/lib/member-activity";

export const dynamic = "force-dynamic";

// GET /api/admin/member-activity — merged timeline of what members have done.
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const items = await getMemberActivity().catch(() => []);
  return NextResponse.json({ items });
}
