import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember, requireSectionEdit } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { getSendTiming, listSendTiming, timingAnchor } from "@/lib/email/readiness";

export const dynamic = "force-dynamic";

/**
 * When the scheduled mails go out — read and write.
 *
 * One global row per mail (migration 138), because "when does the packing list
 * go out?" is a question about the mail, not about a particular week. Both the
 * Emails page and the edition Mailing tab post here, so there is a single
 * writer and the cron's resolver reads exactly what was saved.
 */

export async function GET() {
  const denied = await requireTeamMember();
  if (denied) return denied;
  // Each mail with what it is now, what it would be untouched, and the window it
  // fires in — a lead on its own doesn't tell you whether a late booker gets it.
  return NextResponse.json({ mails: await listSendTiming() });
}

/**
 * PATCH { templateKey, days } — move one mail, globally.
 *
 * `days: null` clears the override and puts the built-in default back, which is
 * the only way out of a number someone regrets.
 */
export async function PATCH(request: NextRequest) {
  // Re-timing a mail changes what every guest receives and when, so it needs
  // edit on emails — the same bar as pressing send.
  const denied = await requireSectionEdit("emails");
  if (denied) return denied;

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const templateKey = typeof body.templateKey === "string" ? body.templateKey : "";
  const anchor = timingAnchor(templateKey);
  if (!anchor) return NextResponse.json({ error: "That mail doesn't go out on a date, so there's nothing to move." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  if (body.days === null) {
    const { error } = await db.from("email_send_timing").delete().eq("template_key", templateKey);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, timing: await getSendTiming() });
  }

  const days = Number(body.days);
  if (!Number.isFinite(days) || !Number.isInteger(days) || days < 0 || days > 400) {
    return NextResponse.json({ error: "Give a whole number of days between 0 and 400." }, { status: 400 });
  }

  const { error } = await db.from("email_send_timing").upsert({
    template_key: templateKey,
    days_before: anchor === "before" ? days : null,
    days_after_end: anchor === "afterEnd" ? days : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "template_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Hand back the recomputed schedule: moving one mail moves the window
  // boundary of its neighbour too, and the caller has to be able to show that.
  return NextResponse.json({ ok: true, timing: await getSendTiming() });
}
