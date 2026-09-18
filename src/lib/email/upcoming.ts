import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { AUTOMATIONS, lifecycleLive, pipelineLiveFrom } from "@/lib/email/automations";
import { MAIL_REQUIREMENTS, resolveEditionContent, getSendTiming, timingAnchor, cronSends, mailAppliesTo } from "@/lib/email/readiness";

/**
 * What the lifecycle cron is about to send, before it sends it.
 *
 * The scheduled mails are the ones nobody triggers — they fire off a date
 * derived from the trip, so the first time you find out one went wrong is when
 * a guest replies. This turns that into a forecast you can look at: which mail,
 * to how many people, on what day, and whether the content it needs is
 * actually there yet.
 *
 * Only the DATE-ANCHORED mails are forecastable. The payment nudges depend on
 * whether an individual invoice is paid on the day the cron runs, so they are
 * deliberately left out rather than guessed at.
 */

/*
 * WHAT THE CRON WOULD DO, NOT WHAT A TRIP USUALLY GETS.
 *
 * This used to be its own hand-typed list (21/14/12/3 days, +1 after) that
 * asked none of the cron's questions. On 18 Sep 2026 it told Nico OBX Wind, an
 * EVENT, would get a packing list, a countdown, final details and a thank-you:
 * four mails the cron never sends to an event. It also ignored the timings set
 * in Emails, the per-week "don't send" switch, the global off switch, the
 * go-live cutoff for older bookings, and whether a guest had already signed the
 * waiver. Every one of those is asked below, with the cron's own helpers
 * wherever one exists, so the two can only drift where this file is edited.
 */

/** Booking statuses the cron treats as secured — only these get lifecycle mail. */
const SECURED = ["confirmed", "downpayment_paid", "paid", "attended"];

const DAY = 86_400_000;
const HORIZON_DAYS = 45;
/** When the daily lifecycle cron fires — mirrors vercel.json ("0 9 * * *"). */
const CRON_HOUR_UTC = 9;

export type UpcomingMail = {
  templateKey: string;
  label: string;
  editionId: string;
  editionTitle: string;
  sendDate: string;
  /** The actual send instant (next cron run on/after the due day), ISO. */
  sendAt: string;
  daysAway: number;
  recipients: number;
  /** blocking content that is still missing — the mail will be held back */
  missing: string[];
  /**
   * The nightly job will NOT send this one: it applies to the week but only
   * goes out when someone presses send (an event's group-chat mail). Listed
   * so it cannot be forgotten; daysAway is negative once its day has passed.
   */
  byHand?: boolean;
};

export async function getUpcomingMails(now = new Date()): Promise<{
  paused: boolean;
  mails: UpcomingMail[];
}> {
  const paused = !lifecycleLive();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  // The same schedule the cron reads: built-in leads plus whatever was set in
  // Emails, with the send windows derived from them.
  const timing = await getSendTiming();
  const dated = AUTOMATIONS.filter((a) => a.source === "scheduled" && timingAnchor(a.key));
  const maxLead = Math.max(0, ...Object.values(timing.before));
  const maxAfter = Math.max(0, ...Object.values(timing.windowCloseAfterEnd));

  const from = new Date(now.getTime() - (maxAfter + 1) * DAY).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + (HORIZON_DAYS + maxLead + 1) * DAY).toISOString().slice(0, 10);

  const { data: editions } = await db
    .from("exp_editions")
    .select("id, kind, label, year, date_start, date_end, status, archived_at, mail_skip, exp_experiences(title)")
    .gte("date_end", from)
    .lte("date_start", to)
    .order("date_start");

  const live = (editions ?? []).filter(
    (e: { status?: string | null; archived_at?: string | null; date_start?: string | null }) =>
      e.status === "published" && !e.archived_at && e.date_start,
  );
  if (!live.length) return { paused, mails: [] };

  // Switched off in Emails, for every week.
  const { data: tpl } = await db.from("email_templates").select("template_key, enabled");
  const offEverywhere = new Set(
    ((tpl ?? []) as { template_key: string; enabled: boolean | null }[]).filter((t) => t.enabled === false).map((t) => t.template_key),
  );

  // One count query for every edition rather than one per mail.
  const { data: bookings } = await db
    .from("exp_bookings")
    .select("id, edition_id, status, downpayment_received, created_at")
    .in("edition_id", live.map((e: { id: string }) => e.id));

  // Booked before the go-live cutoff = never mailed automatically (the cron's
  // bookedLive). Same for a trip that itself starts before it (tripLive).
  const liveFrom = pipelineLiveFrom();
  const onOrAfterCutoff = (d?: string | null) => liveFrom == null || (!!d && new Date(d).getTime() >= liveFrom);

  // A paid deposit does not resurrect a dead booking: Alaçatı's forecast said
  // "18 guests" while the cron correctly mailed 15, because three LOST bookings
  // had their downpayment flag still set (guests who paid, then dropped out).
  // The cron never mails lost — neither may the forecast count them.
  const securedByEdition = new Map<string, string[]>();
  // Everyone secured, cutoff or not: a hand-send reaches them all.
  const securedAllByEdition = new Map<string, string[]>();
  for (const b of (bookings ?? []) as { id: string; edition_id: string | null; status: string | null; downpayment_received: boolean | null; created_at: string | null }[]) {
    if (!b.edition_id || b.status === "lost") continue;
    const secured = b.downpayment_received || SECURED.includes(String(b.status));
    if (!secured) continue;
    securedAllByEdition.set(b.edition_id, [...(securedAllByEdition.get(b.edition_id) ?? []), b.id]);
    if (onOrAfterCutoff(b.created_at)) {
      securedByEdition.set(b.edition_id, [...(securedByEdition.get(b.edition_id) ?? []), b.id]);
    }
  }
  const allIds = [...securedAllByEdition.values()].flat();

  // What already WENT OUT stops being a forecast. Without this, "Thank you +
  // review · today" sat on the dashboard all day after the mails were sent.
  // One query: sent rows for these bookings and these templates; each mail's
  // recipient count below is only the bookings still waiting.
  const sent = new Set<string>();
  const signed = new Set<string>();
  if (allIds.length) {
    const { data: sentRows } = await db
      .from("email_log")
      .select("booking_id, template_key")
      .eq("status", "sent")
      .in("template_key", dated.map((a) => a.key))
      .in("booking_id", allIds);
    for (const r of (sentRows ?? []) as { booking_id: string | null; template_key: string | null }[]) {
      if (r.booking_id && r.template_key) sent.add(`${r.template_key}:${r.booking_id}`);
    }
    // The waiver reminder only goes to guests who have not signed.
    const { data: sigs } = await db.from("exp_waiver_signatures").select("booking_id").in("booking_id", allIds);
    for (const g of (sigs ?? []) as { booking_id: string | null }[]) if (g.booking_id) signed.add(g.booking_id);
  }

  // The cron runs once a day at 09:00 UTC. On a run day D it sees
  // daysToStart = start - D and daysSinceEnd = D - end, in whole days.
  const todayDay = Math.floor(now.getTime() / DAY);
  const firstRunDay = now.getTime() < todayDay * DAY + CRON_HOUR_UTC * 3_600_000 ? todayDay : todayDay + 1;
  const dayOf = (iso: string) => Math.floor(new Date(iso + "T00:00:00Z").getTime() / DAY);

  const out: UpcomingMail[] = [];

  for (const ed of live) {
    const everyone = securedAllByEdition.get(ed.id) ?? [];
    if (!everyone.length) continue; // nothing to send, nothing to warn about
    // The cron's reach: booked after the cutoff, on a week that starts after it.
    const securedIds = onOrAfterCutoff(ed.date_start) ? securedByEdition.get(ed.id) ?? [] : [];
    const skip = new Set<string>((ed.mail_skip ?? []) as string[]);
    const startDay = dayOf(ed.date_start);
    const endDay = ed.date_end ? dayOf(ed.date_end) : null;

    let values: Record<string, unknown> | null = null;
    const title = `${ed.exp_experiences?.title ?? "Trip"}${ed.label ? ` · ${ed.label}` : ed.year ? ` ${ed.year}` : ""}`;

    for (const a of dated) {
      if (skip.has(a.key) || offEverywhere.has(a.key)) continue;

      if (!cronSends(ed.kind, a.key)) {
        // Applies to this week, but only a press sends it. Surface it from its
        // suggested day until the week starts, overdue included: OBX Wind's
        // group-chat mail sat unsent five weeks past its day with nothing on
        // this panel to say so.
        if (timingAnchor(a.key) !== "before") continue;
        values ??= (await resolveEditionContent(ed.id).catch(() => ({ values: {} }))).values as Record<string, unknown>;
        if (!mailAppliesTo(ed.kind, a.key, values as Record<string, string | null>)) continue;
        const suggested = startDay - timing.before[a.key];
        if (startDay <= todayDay || suggested - todayDay > HORIZON_DAYS) continue;
        const waiting = everyone.filter((id) => !sent.has(`${a.key}:${id}`)).length;
        if (!waiting) continue;
        out.push({
          templateKey: a.key,
          label: a.name,
          editionId: ed.id,
          editionTitle: title,
          sendDate: new Date(suggested * DAY).toISOString().slice(0, 10),
          sendAt: "",
          daysAway: suggested - todayDay,
          recipients: waiting,
          missing: (MAIL_REQUIREMENTS[a.key]?.blocking ?? []).filter((k) => !values![k]),
          byHand: true,
        });
        continue;
      }
      if (!securedIds.length) continue;

      // The window the cron fires in, as run days: [open, close].
      let open: number, close: number;
      if (timingAnchor(a.key) === "before") {
        open = startDay - timing.before[a.key];
        close = startDay - timing.windowClose[a.key] - 1;
      } else {
        if (endDay == null) continue; // the cron cannot count from an end it doesn't have
        open = endDay + timing.afterEnd[a.key];
        close = endDay + timing.windowCloseAfterEnd[a.key];
      }
      // A mail whose day has arrived but whose run has passed goes out at the
      // NEXT run while its window is still open, so that is the day shown.
      const runDay = Math.max(open, firstRunDay);
      if (runDay > close) continue;
      const daysAway = runDay - todayDay;
      if (daysAway > HORIZON_DAYS) continue;

      // Only bookings this mail has NOT yet reached. A fully-sent mail
      // disappears from the panel; a partial failure honestly shows the rest.
      const recipients = securedIds.filter((id) =>
        !sent.has(`${a.key}:${id}`) && !(a.key === "waiver_reminder" && signed.has(id)),
      ).length;
      if (!recipients) continue;

      // Resolve content once per edition, and only for one that sends something.
      values ??= (await resolveEditionContent(ed.id).catch(() => ({ values: {} }))).values as Record<string, unknown>;
      const missing = (MAIL_REQUIREMENTS[a.key]?.blocking ?? []).filter((k) => !values![k]);

      const sendAtMs = runDay * DAY + CRON_HOUR_UTC * 3_600_000;
      out.push({
        templateKey: a.key,
        label: a.name,
        editionId: ed.id,
        editionTitle: title,
        sendDate: new Date(sendAtMs).toISOString().slice(0, 10),
        sendAt: new Date(sendAtMs).toISOString(),
        daysAway,
        recipients,
        missing,
      });
    }
  }

  out.sort((x, y) => x.daysAway - y.daysAway || x.editionTitle.localeCompare(y.editionTitle));
  return { paused, mails: out };
}
