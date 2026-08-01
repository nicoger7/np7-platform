import { NextRequest, NextResponse } from "next/server";
import { requireTeamMember } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { AUTOMATIONS } from "@/lib/email/automations";
import { SEND_SCHEDULE, resolveEditionContent, MAIL_REQUIREMENTS } from "@/lib/email/readiness";

export const dynamic = "force-dynamic";

/**
 * One week's mail, in one place: what has gone, what is next, and to how many.
 *
 * The pieces existed but were scattered — the schedule lived in the cron, sent
 * mail in the Email Log, held mail on the Branding tab, the forecast on the
 * dashboard. Nobody could answer "what has this week's guests actually had
 * from us?", which is the question you have when someone replies.
 */

const SECURED = ["confirmed", "downpayment_paid", "paid", "attended"];
const DAY = 86_400_000;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { startDate, values } = await resolveEditionContent(id);
  const { data: ed } = await db.from("exp_editions").select("date_start, date_end").eq("id", id).maybeSingle();

  const { data: bookings } = await db
    .from("exp_bookings")
    .select("id, name, status, downpayment_received, contact_id, contacts(name, email)")
    .eq("edition_id", id);
  const rows = (bookings ?? []) as { id: string; name: string | null; status: string | null; downpayment_received: boolean | null }[];
  const secured = rows.filter((b) => b.downpayment_received || SECURED.includes(String(b.status)));
  const bookingIds = rows.map((b) => b.id);

  // What has actually gone out, per template.
  const sentByTemplate: Record<string, { sent: number; last: string | null }> = {};
  if (bookingIds.length) {
    const { data: log } = await db
      .from("email_log")
      .select("template_key, status, created_at, sent_at")
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: false })
      .limit(2000);
    for (const l of (log ?? []) as { template_key: string; status: string | null; created_at: string; sent_at: string | null }[]) {
      if (l.status !== "sent") continue;
      const e = (sentByTemplate[l.template_key] ??= { sent: 0, last: null });
      e.sent += 1;
      const at = l.sent_at ?? l.created_at;
      if (!e.last || at > e.last) e.last = at;
    }
  }

  const today = Date.now();
  const start = startDate ? new Date(startDate).getTime() : null;

  // The scheduled mails, in the order they fire, with what each still needs.
  const scheduled = AUTOMATIONS.filter((a) => a.source === "scheduled").map((a) => {
    const lead = SEND_SCHEDULE[a.key as keyof typeof SEND_SCHEDULE];
    const dueAt = lead != null && start != null ? new Date(start - lead * DAY).toISOString().slice(0, 10) : null;
    const daysAway = dueAt ? Math.round((new Date(dueAt).getTime() - today) / DAY) : null;
    const blocking = MAIL_REQUIREMENTS[a.key]?.blocking ?? [];
    return {
      key: a.key,
      name: a.name,
      trigger: a.trigger,
      daysBefore: lead ?? null,
      dueAt,
      daysAway,
      missing: blocking.filter((k) => !values[k]),
      sent: sentByTemplate[a.key]?.sent ?? 0,
      lastSent: sentByTemplate[a.key]?.last ?? null,
    };
  }).sort((x, y) => (y.daysBefore ?? -999) - (x.daysBefore ?? -999));

  // Mail that isn't on a schedule but still went to these guests.
  const other = Object.entries(sentByTemplate)
    .filter(([k]) => !scheduled.some((s) => s.key === k))
    .map(([k, v]) => ({ key: k, name: AUTOMATIONS.find((a) => a.key === k)?.name ?? k, ...v }))
    .sort((a, b) => (b.last ?? "").localeCompare(a.last ?? ""));

  return NextResponse.json({
    startDate: ed?.date_start ?? startDate ?? null,
    endDate: ed?.date_end ?? null,
    guests: rows.length,
    securedGuests: secured.length,
    content: { packingList: !!values.packingList, preTripNote: !!values.preTripNote, whatsappLink: !!values.whatsappLink },
    scheduled,
    other,
  });
}
