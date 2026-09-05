import { NextResponse } from "next/server";
import { getEffectiveAccess, getRequestMember, requireAdminGate } from "@/lib/admin-auth";
import { getHoursActor } from "@/lib/hours-auth";
// GET /api/admin/me — the current team member's effective access, for client
// components that redact sensitive fields (prices, costs, contact PII). Also
// returns the member's id/name + whether they can manage others' hours, so the
// Hours Log can auto-attach entries to the signed-in user.
export async function GET() {
  const denied = await requireAdminGate();
  if (denied) return denied;
  // Resolved by the middleware and signed into the request; no second lookup.
  const member = await getRequestMember();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const access = await getEffectiveAccess(member);
  const actor = await getHoursActor();
  return NextResponse.json({
    access,
    member: actor ? { id: actor.id, name: actor.name } : null,
    canManageHours: actor?.canManageOthers ?? false,
  });
}
