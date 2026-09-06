import { NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { getMemberActivity } from "@/lib/member-activity";

export const dynamic = "force-dynamic";

// GET /api/admin/member-activity — merged timeline of what members have done.
export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // Deep enough that every member who has ever registered reaches the page,
  // rather than being pushed off the end by a busy week of bookings.
  const items = await getMemberActivity(400).catch(() => []);
  return NextResponse.json({ items });
}
