import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { listInvites, addInvites, removeInvite, sendSurveyInviteEmail } from "@/lib/surveys";

// GET /api/admin/surveys/:id/invites — invites joined with contact + response.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  return NextResponse.json({ invites: await listInvites(id) });
}

// POST /api/admin/surveys/:id/invites — add invites for { contactIds:[], sendEmail:bool }.
// Returns the newly-created invites (with tokens) and, when sendEmail, the send results.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const { contactIds, sendEmail } = await request.json().catch(() => ({ contactIds: [] }));
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "Pick at least one member." }, { status: 400 });
  }
  const created = await addInvites(id, contactIds);
  const origin = new URL(request.url).origin;
  let emailed = 0;
  if (sendEmail) {
    for (const inv of created) {
      const r = await sendSurveyInviteEmail(inv.id, `${origin}/survey/${inv.token}`);
      if (r === "sent") emailed += 1;
    }
  }
  return NextResponse.json({ created, emailed });
}

// DELETE /api/admin/surveys/:id/invites?inviteId=... — remove one invite.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  await params; // id not needed (inviteId is unique)
  const inviteId = new URL(request.url).searchParams.get("inviteId");
  if (!inviteId) return NextResponse.json({ error: "Missing inviteId" }, { status: 400 });
  await removeInvite(inviteId);
  return NextResponse.json({ ok: true });
}
