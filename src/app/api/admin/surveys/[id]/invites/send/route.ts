import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { listInvites, sendSurveyInviteEmail } from "@/lib/surveys";

// POST /api/admin/surveys/:id/invites/send — email every invite that hasn't been
// emailed yet (the admin's explicit "send" button). Add first, review the list,
// remove anyone, THEN send — instead of mailing at add-time. Double-press safe:
// the mail layer dedupes per invite, and we only target un-emailed ones anyway.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const origin = new URL(request.url).origin;

  const invites = await listInvites(id);
  // open-link joiners invited themselves — never blast them the invite email
  const pending = invites.filter((i) => !i.emailed && i.contactEmail && i.source !== "open_link");
  let sent = 0, skipped = 0, failed = 0;
  for (const inv of pending) {
    const r = await sendSurveyInviteEmail(inv.id, `${origin}/survey/${inv.token}`);
    if (r === "sent") sent++;
    else if (r === "skipped") skipped++;
    else failed++;
  }
  return NextResponse.json({ ok: true, pending: pending.length, sent, skipped, failed });
}
