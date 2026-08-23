import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { lifecycleLive } from "@/lib/email/automations";
import { MAIL_REQUIREMENTS, resolveEditionContent } from "@/lib/email/readiness";

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

/** Days BEFORE date_start (negative = days AFTER date_end) that each mail fires. */
const ANCHORS: { key: string; label: string; beforeStart?: number; afterEnd?: number }[] = [
  { key: "pre_trip_info", label: "Pre-trip info & packing list", beforeStart: 21 },
  { key: "waiver_reminder", label: "Waiver reminder", beforeStart: 14 },
  { key: "pre_trip_excitement", label: "Countdown / excitement", beforeStart: 12 },
  { key: "pre_trip_final", label: "Final details", beforeStart: 3 },
  { key: "post_trip_thank_you", label: "Thank you + review", afterEnd: 1 },
];

/** Booking statuses the cron treats as secured — only these get lifecycle mail. */
const SECURED = ["confirmed", "downpayment_paid", "paid", "attended"];

const DAY = 86_400_000;
const HORIZON_DAYS = 45;

export type UpcomingMail = {
  templateKey: string;
  label: string;
  editionId: string;
  editionTitle: string;
  sendDate: string;
  daysAway: number;
  recipients: number;
  /** blocking content that is still missing — the mail will be held back */
  missing: string[];
};

export async function getUpcomingMails(now = new Date()): Promise<{
  paused: boolean;
  mails: UpcomingMail[];
}> {
  const paused = !lifecycleLive();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const from = new Date(now.getTime() - 20 * DAY).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + (HORIZON_DAYS + 25) * DAY).toISOString().slice(0, 10);

  const { data: editions } = await db
    .from("exp_editions")
    .select("id, label, year, date_start, date_end, status, archived_at, exp_experiences(title)")
    .gte("date_end", from)
    .lte("date_start", to)
    .order("date_start");

  const live = (editions ?? []).filter(
    (e: { status?: string | null; archived_at?: string | null; date_start?: string | null }) =>
      e.status === "published" && !e.archived_at && e.date_start,
  );
  if (!live.length) return { paused, mails: [] };

  // One count query for every edition rather than one per mail.
  const { data: bookings } = await db
    .from("exp_bookings")
    .select("edition_id, status, downpayment_received")
    .in("edition_id", live.map((e: { id: string }) => e.id));

  const securedByEdition = new Map<string, number>();
  for (const b of (bookings ?? []) as { edition_id: string | null; status: string | null; downpayment_received: boolean | null }[]) {
    if (!b.edition_id) continue;
    const secured = b.downpayment_received || SECURED.includes(String(b.status));
    if (secured) securedByEdition.set(b.edition_id, (securedByEdition.get(b.edition_id) ?? 0) + 1);
  }

  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const out: UpcomingMail[] = [];

  for (const ed of live) {
    const recipients = securedByEdition.get(ed.id) ?? 0;
    if (!recipients) continue; // nothing to send, nothing to warn about

    // Resolve content once per edition, not once per mail.
    const { values } = await resolveEditionContent(ed.id).catch(() => ({ values: {} as Record<string, string | null> }));
    const title = `${ed.exp_experiences?.title ?? "Trip"}${ed.label ? ` · ${ed.label}` : ed.year ? ` ${ed.year}` : ""}`;

    for (const a of ANCHORS) {
      const anchor = a.beforeStart != null ? ed.date_start : ed.date_end ?? ed.date_start;
      if (!anchor) continue;
      const base = new Date(anchor + "T00:00:00Z").getTime();
      const sendAt = a.beforeStart != null ? base - a.beforeStart * DAY : base + (a.afterEnd ?? 0) * DAY;
      const daysAway = Math.round((sendAt - today) / DAY);
      if (daysAway < 0 || daysAway > HORIZON_DAYS) continue;

      const blocking = MAIL_REQUIREMENTS[a.key]?.blocking ?? [];
      const missing = blocking.filter((k) => !values[k]);

      out.push({
        templateKey: a.key,
        label: a.label,
        editionId: ed.id,
        editionTitle: title,
        sendDate: new Date(sendAt).toISOString().slice(0, 10),
        daysAway,
        recipients,
        missing,
      });
    }
  }

  out.sort((x, y) => x.daysAway - y.daysAway || x.editionTitle.localeCompare(y.editionTitle));
  return { paused, mails: out };
}
