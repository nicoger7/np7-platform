import { NextRequest, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/public-origin";
import { createAdminClient } from "@/lib/supabase";
import { inviteTeamMember } from "@/lib/members";
import { requireAdminGate } from "@/lib/admin-auth";
/**
 * POST /api/admin/team/[id]/invite
 * Emails the team member a one-time login link (creating their auth account if
 * needed) and links team_members.auth_user_id. Owner-only (middleware gates
 * /api/admin/team). Admin login mail is allowed by the soft-launch guard.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: member } = await db.from("team_members").select("*").eq("id", id).maybeSingle();
  if (!member?.email) {
    return NextResponse.json({ error: "This team member has no email to invite." }, { status: 400 });
  }

  const origin = publicOrigin();
  const firstName = (member.name ?? "").split(" ")[0] || undefined;
  const res = await inviteTeamMember({ email: member.email, origin, firstName });

  if (res.userId && member.auth_user_id !== res.userId) {
    await db.from("team_members").update({ auth_user_id: res.userId }).eq("id", id);
  }
  if (!res.sent) {
    return NextResponse.json({ error: "Could not send the invite. Check the email + Resend." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
