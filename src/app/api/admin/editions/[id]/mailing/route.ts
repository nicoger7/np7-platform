import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { requireTeamMember, requireSectionEdit } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase";
import { AUTOMATIONS, CANNOT_DISABLE, lifecycleLive } from "@/lib/email/automations";
import { listSendTiming, timingAnchor, resolveEditionContent, MAIL_REQUIREMENTS, CONTENT_LABELS, type ContentKey } from "@/lib/email/readiness";

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

  const { startDate, values, inherited, source } = await resolveEditionContent(id);
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
  const end = ed?.date_end ? new Date(ed.date_end).getTime() : null;

  // Whether each mail is switched on at all. A row saying "Due 5 Aug" while the
  // template is off is a lie, and the switch lives two pages away.
  const { data: templates } = await db.from("email_templates").select("template_key, enabled");
  const enabledByKey = new Map<string, boolean>();
  for (const t of (templates ?? []) as { template_key: string; enabled: boolean | null }[]) {
    enabledByKey.set(t.template_key, t.enabled !== false);
  }

  // The effective schedule — built-in defaults plus whatever the admin set on
  // the Emails page. Read here rather than re-derived, so this panel and the
  // cron can never disagree about when a mail goes out.
  const timingBy = new Map((await listSendTiming()).map((t) => [t.key, t]));

  // The scheduled mails, in the order they fire, with what each still needs.
  //
  // Two very different things live under source: "scheduled". Some fire on a
  // date worked out from the trip dates — those have a lead in the schedule.
  // The rest fire when something becomes true (a payment lands, a deadline
  // passes, photos appear), so they have no date at all and were rendering as a
  // bare "—" with "Due —" next to it, which reads like something is broken.
  // `whenKind` lets the panel keep them apart and say so.
  const scheduled = AUTOMATIONS.filter((a) => a.source === "scheduled").map((a) => {
    const t = timingBy.get(a.key);
    const lead = t?.anchor === "before" ? t.days : undefined;
    const after = t?.anchor === "afterEnd" ? t.days : undefined;
    const dueAt = lead != null && start != null
      ? new Date(start - lead * DAY).toISOString().slice(0, 10)
      : after != null && end != null
        ? new Date(end + after * DAY).toISOString().slice(0, 10)
        : null;
    const daysAway = dueAt ? Math.round((new Date(dueAt).getTime() - today) / DAY) : null;
    // Passed = the cron can no longer fire it, not "the ideal day went by".
    // crew_forming has a 38-day window; calling it passed on day 2 of 39 told
    // the admin to catch up a mail that needed no catching up.
    const close = lead != null ? t?.windowClose : undefined;
    const closeAfter = after != null ? t?.windowClose : undefined;
    const daysToStart = start != null ? Math.round((start - today) / DAY) : null;
    const daysSinceEnd = end != null ? Math.round((today - end) / DAY) : null;
    const windowPassed = dueAt != null && (
      close != null ? (daysToStart != null && daysToStart <= close)
      : closeAfter != null ? (daysSinceEnd != null && daysSinceEnd > closeAfter)
      : (daysAway != null && daysAway < 0));
    const req = MAIL_REQUIREMENTS[a.key];
    const uses = [...(req?.blocking ?? []), ...(req?.soft ?? [])];
    return {
      key: a.key,
      name: a.name,
      trigger: a.trigger,
      whenKind: dueAt != null ? "date" as const : "condition" as const,
      daysBefore: lead ?? null,
      daysAfterEnd: after ?? null,
      windowPassed,
      dueAt,
      daysAway,
      // The lead is editable from this row (globally — it is one schedule for
      // every trip), so the panel needs the default to offer a way back and the
      // window to show what moving it does to the handover.
      timing: t ? { anchor: t.anchor, days: t.days, defaultDays: t.defaultDays, windowClose: t.windowClose, overridden: t.overridden } : null,
      kind: a.kind,
      enabled: enabledByKey.get(a.key) ?? true,
      canDisable: !CANNOT_DISABLE.has(a.key),
      missing: (req?.blocking ?? []).filter((k) => !values[k]),
      // What this mail pulls in, so the row can be opened and filled in here
      // rather than sending you to Event Content to guess which field it meant.
      uses: uses.map((k) => ({
        key: k,
        label: CONTENT_LABELS[k].label,
        blocking: (req?.blocking ?? []).includes(k),
        value: values[k],
        source: source[k],
        inherited: k === "whatsappLink" || k === "finalDetailsNote" ? null : inherited[k as "packingList" | "preTripNote"],
      })),
      sent: sentByTemplate[a.key]?.sent ?? 0,
      lastSent: sentByTemplate[a.key]?.last ?? null,
    };
  }).sort((x, y) => {
    // One key per mail — the previous comparator consulted the OTHER side's
    // fields in its fallback and contradicted itself between argument orders.
    const k = (m: { daysBefore: number | null; daysAfterEnd: number | null }) =>
      m.daysBefore ?? (m.daysAfterEnd != null ? -m.daysAfterEnd : -999);
    return k(y) - k(x);
  });

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
    lifecycleLive: lifecycleLive(),
    scheduled,
    other,
  });
}


/**
 * Send a scheduled mail now, after its window has passed.
 *
 * The cron only fires inside each mail's date window. Miss it — the pipeline was
 * off, the guest booked late, content wasn't ready — and the mail simply never
 * happens, which is what "Window passed" meant with no way to act on it. This is
 * the manual catch-up.
 *
 * `manual: true` so the soft-launch guard doesn't swallow it: a human pressed
 * this. The per-booking dedupe key still applies, so pressing twice is safe and
 * nobody gets it twice.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // This URL lives under "experiences", but pressing it mails every secured
  // guest — so it asks for edit on EMAILS, not on the trip.
  const denied = await requireSectionEdit("emails");
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const templateKey = typeof body.templateKey === "string" ? body.templateKey : "";
  if (!templateKey) return NextResponse.json({ error: "No mail chosen." }, { status: 400 });

  // Only the mails this panel actually schedules. The route took ANY key, so a
  // crafted request could fire e.g. deposit_confirmation with half its vars
  // missing — nothing in the UI offered that, which is exactly why the API
  // must not accept it.
  if (!timingAnchor(templateKey)) {
    return NextResponse.json({ error: "That mail isn't a scheduled one — it can't be catch-up sent from here." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { values } = await resolveEditionContent(id);

  // Refuse rather than send a hollow mail — same rule the held-mail path uses.
  const missing = (MAIL_REQUIREMENTS[templateKey]?.blocking ?? []).filter((k) => !values[k]);
  if (missing.length) {
    return NextResponse.json({ error: `Still missing ${missing.join(", ")} — fill it in first.` }, { status: 400 });
  }

  const { data: bookings } = await db
    .from("exp_bookings")
    .select("id, status, downpayment_received, contact_id, contacts(name,email), exp_experiences(title), exp_editions(date_start,date_end,whatsapp_group_link)")
    .eq("edition_id", id);

  // The waiver reminder has a per-guest condition the dedupe key can't cover:
  // a guest who signed on day one has no prior send row, so only this check
  // keeps the catch-up from nagging people who already did the thing.
  const signed = new Set<string>();
  if (templateKey === "waiver_reminder") {
    const ids = ((bookings ?? []) as { id: string }[]).map((b) => b.id);
    if (ids.length) {
      const { data: sigs } = await db.from("exp_waiver_signatures").select("booking_id").in("booking_id", ids);
      for (const sg of (sigs ?? []) as { booking_id: string | null }[]) if (sg.booking_id) signed.add(sg.booking_id);
    }
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com";
  const fmt = (x: string) => new Date(x).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  let sent = 0, skipped = 0;

  // Pre-trip mail goes to secured guests only — the same rule the cron applies.
  for (const b of (bookings ?? []) as Record<string, any>[]) {
    const secured = b.downpayment_received || SECURED.includes(String(b.status));
    const email = b.contacts?.email;
    if (!secured || !email) { skipped++; continue; }
    if (templateKey === "waiver_reminder" && signed.has(String(b.id))) { skipped++; continue; }
    const s = b.exp_editions?.date_start as string | null;
    const e = b.exp_editions?.date_end as string | null;
    const res = await sendEmail({
      to: email,
      templateKey,
      manual: true,
      dedupeKey: `${templateKey}:${b.id}`,
      vars: {
        firstName: String(b.contacts?.name ?? "").split(" ")[0] || "there",
        experienceTitle: b.exp_experiences?.title,
        dates: s ? (e ? `${fmt(s)} – ${fmt(e)} ${new Date(e).getFullYear()}` : `${fmt(s)} ${new Date(s).getFullYear()}`) : undefined,
        preTripNote: values.preTripNote ?? undefined,
        finalDetailsNote: values.finalDetailsNote ?? undefined,
        packingList: values.packingList ?? undefined,
        whatsappLink: b.exp_editions?.whatsapp_group_link ?? values.whatsappLink ?? undefined,
        bookingLink: `${origin}/account`,
        tripLink: `${origin}/account/bookings/${b.id}`,
        waiverLink: `${origin}/account/bookings/${b.id}/waiver`,
      },
      bookingId: b.id,
      contactId: b.contact_id,
    });
    if (res.status === "sent") sent++; else skipped++;
  }
  return NextResponse.json({ ok: true, sent, skipped });
}


/**
 * Save one of this week's content overrides, from the mail that uses it.
 *
 * The fields live on the edition (`pre_trip_note`, `packing_list`,
 * `whatsapp_group_link`) and fall back to the experience — but you only ever
 * think about them in terms of a mail: "what does the pre-trip mail actually
 * say?". Editing them from the mail row means the answer and the edit are in
 * the same place, with the inherited default visible next to it.
 */
const OVERRIDE_COLUMN: Record<ContentKey, string> = {
  packingList: "packing_list",
  preTripNote: "pre_trip_note",
  whatsappLink: "whatsapp_group_link",
  finalDetailsNote: "final_details_note",
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const key = String(body.key ?? "") as ContentKey;
  const column = OVERRIDE_COLUMN[key];
  if (!column) return NextResponse.json({ error: "Unknown field." }, { status: 400 });

  const raw = typeof body.value === "string" ? body.value.trim() : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { error } = await db.from("exp_editions").update({ [column]: raw || null }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
