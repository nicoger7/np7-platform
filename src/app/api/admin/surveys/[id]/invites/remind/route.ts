import { NextRequest, NextResponse } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { listInvites, sendSurveyReminderEmail } from "@/lib/surveys";
import { requireAdminGate } from "@/lib/admin-auth";
import { publicOrigin } from "@/lib/public-origin";
// POST /api/admin/surveys/:id/invites/remind — nudge the silent invitees.
// body: { target: "all" | "opened" | "unopened", subject?: string }
//
// Eligible = got the original email, hasn't answered, address isn't bouncing,
// and hasn't been reminded before (one reminder per invite — the email layer's
// dedupe key backstops that even across double-clicks). "opened"/"unopened"
// split on the Resend open pixel, so the admin can nudge warm and cold
// audiences with different expectations.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const target: string = body?.target === "opened" || body?.target === "unopened" ? body.target : "all";
  const subject: string | undefined = typeof body?.subject === "string" && body.subject.trim() ? body.subject.trim() : undefined;
  const origin = publicOrigin();

  const invites = await listInvites(id);
  const eligible = invites.filter((i) =>
    i.emailed && i.contactEmail && !i.response && i.status !== "completed" &&
    i.emailEvent !== "bounced" && i.emailEvent !== "complained" && !i.remindedAt &&
    (target === "all" ? true : target === "opened" ? !!i.emailOpenedAt : !i.emailOpenedAt));

  let sent = 0, skipped = 0, failed = 0;
  for (const inv of eligible) {
    const r = await sendSurveyReminderEmail(inv.id, `${origin}/survey/${inv.token}`, subject);
    if (r === "sent") sent++;
    else if (r === "skipped") skipped++;
    else failed++;
  }
  return NextResponse.json({ ok: true, eligible: eligible.length, sent, skipped, failed });
}
