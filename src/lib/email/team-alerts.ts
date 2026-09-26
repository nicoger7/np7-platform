import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { publicOrigin } from "@/lib/public-origin";

/**
 * The mail NP7's own people get.
 *
 * Every other template in this codebase writes to a guest. These write to us:
 * a booking landed, and nobody here would know unless they happened to open the
 * admin (Nico, 21 Sep 2026).
 *
 * WHY A SWEEP AND NOT A HOOK
 *
 * The obvious place to fire this is the moment a booking row is written. There
 * is no single place where that happens: five routes call insertBooking, and
 * /api/week-interest inserts directly past it. A hook would therefore have to
 * be added in six places, each of which is a chance to forget it in the seventh
 * — and a booking nobody is told about is exactly the failure this exists to
 * prevent.
 *
 * So it reads the table instead. Anything that lands in exp_bookings is
 * announced, whoever wrote it and whichever route they used, including the
 * admin typing one in by hand and any future import. Being a sweep also makes
 * it safe to run often and safe to run twice: every send carries a dedupe key
 * of booking + recipient, so a booking is announced exactly once per person
 * even if the cron overlaps itself.
 *
 * WHAT IT WILL NOT DO
 *  · never reaches back past its own first run. A fresh install would otherwise
 *    announce every booking in the history, all at once, to everybody.
 *  · never announces a guest-invisible row: a lost booking, or a companion
 *    covered by somebody else's payment, is not a new booking arriving.
 */

/** The internal events a recipient can subscribe to, in code so an event
 *  nobody sends can never be subscribed to from the admin. */
export const TEAM_EVENTS = [
  {
    key: "booking_created",
    title: "A new booking",
    blurb: "One mail per booking, the moment the sweep next runs. Who booked, which week, which package, and what it is worth.",
    templateKey: "team_booking_created",
  },
  {
    key: "addon_requested",
    title: "A guest asks for an add-on",
    blurb: "A guest asked for something from their trip page (an extra night, a lesson, a transfer) and it is waiting for someone to confirm or decline it.",
    templateKey: "team_addon_requested",
  },
] as const;

export type TeamEventKey = (typeof TEAM_EVENTS)[number]["key"];

export type TeamRecipient = { id: string; event_key: string; email: string; name: string | null; enabled: boolean };

/** Everyone subscribed to an event, enabled only. */
export async function recipientsFor(eventKey: string): Promise<TeamRecipient[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("team_mail_recipients")
    .select("id,event_key,email,name,enabled")
    .eq("event_key", eventKey).eq("enabled", true);
  if (error) return [];
  return (data ?? []) as TeamRecipient[];
}

const money = (n: number | null | undefined, cur = "EUR") =>
  n == null ? null : `${cur === "EUR" ? "€" : cur + " "}${Number(n).toLocaleString("en-US")}`;

const fmtRange = (start?: string | null, end?: string | null) => {
  if (!start) return null;
  const s = new Date(start), e = end ? new Date(end) : null;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return e ? `${d(s)} - ${d(e)} ${e.getFullYear()}` : `${d(s)} ${s.getFullYear()}`;
};

export type SweepResult = { looked: number; announced: number; recipients: number; skipped: string[] };

/**
 * Announce every booking created since `since` that nobody has been told about.
 *
 * `since` exists so the first run cannot empty the whole history into an inbox.
 * The dedupe key does the real work: `team:booking_created:<booking>:<email>`
 * is unique in email_log, so a booking already announced to someone is skipped
 * whatever the window says.
 */
export async function sweepNewBookings(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("booking_created");
  if (!to.length) return { looked: 0, announced: 0, recipients: 0, skipped: ["nobody is subscribed"] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const since = opts?.since ?? new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("exp_bookings")
    .select("id,created_at,status,agreed_price,covered_by_booking_id,contacts(name,email),exp_experiences(title,currency),exp_editions(label,date_start,date_end),exp_packages(name)")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return { looked: 0, announced: 0, recipients: to.length, skipped: [String(error.message ?? error)] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const origin = publicOrigin();
  let announced = 0;
  const skipped: string[] = [];

  for (const b of rows) {
    // A lost booking, or a companion somebody else is paying for, is not a new
    // booking arriving. The payer's own mail already names the whole group.
    if (String(b.status ?? "").toLowerCase() === "lost" || b.covered_by_booking_id) continue;

    const vars = {
      guestName: String(b.contacts?.name ?? "").trim() || b.contacts?.email || "Someone",
      guestEmail: b.contacts?.email ?? "",
      experienceTitle: b.exp_experiences?.title ?? "an NP7 trip",
      editionLabel: b.exp_editions?.label ?? "",
      dates: fmtRange(b.exp_editions?.date_start, b.exp_editions?.date_end) ?? "",
      packageName: b.exp_packages?.name ?? "",
      total: money(b.agreed_price, b.exp_experiences?.currency) ?? "",
      bookingStatus: String(b.status ?? "lead"),
      adminLink: `${origin}/admin/bookings/${b.id}`,
    };

    for (const r of to) {
      const res = await sendEmail({
        to: r.email,
        templateKey: "team_booking_created",
        vars,
        // Internal, not guest lifecycle: it must not sit behind the soft-launch
        // gate that holds customer mail until EMAIL_LIFECYCLE_LIVE is set.
        manual: true,
        bookingId: b.id,
        dedupeKey: `team:booking_created:${b.id}:${r.email.toLowerCase()}`,
      }).catch((e) => ({ status: "error" as const, error: e instanceof Error ? e.message : String(e) }));
      if (res.status === "sent") announced++;
      else if (res.status !== "skipped") skipped.push(`${r.email}: ${res.error ?? "failed"}`);
    }
  }
  return { looked: rows.length, announced, recipients: to.length, skipped };
}

/**
 * Announce every add-on a guest has asked for that is still waiting.
 *
 * A guest can request an extra night, a lesson, a transfer from their trip
 * page. The row lands as `requested` and sat there until somebody happened to
 * open that booking — there was no signal at all that a guest had asked for
 * something (Nico, 26 Sep 2026: "did you build out the team-mails for bookings
 * or requested add-ons?").
 *
 * Only requests still WAITING. One confirmed or declined inside the quarter hour
 * before the sweep has already been dealt with, and a mail saying "Paul asked
 * for a night" about a night somebody already said yes to is noise. Only the
 * guest's own requests (source = member): an add-on the team put on a booking
 * themselves is not news to the team.
 */
export async function sweepAddonRequests(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("addon_requested");
  if (!to.length) return { looked: 0, announced: 0, recipients: 0, skipped: ["nobody is subscribed"] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const since = opts?.since ?? new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("exp_booking_addons")
    .select("id,booking_id,label,price,quantity,status,source,requested_at,exp_bookings(id,contacts(name,email),exp_experiences(title,currency),exp_editions(label,date_start,date_end))")
    .eq("source", "member").eq("status", "requested")
    .gte("requested_at", since)
    .order("requested_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return { looked: 0, announced: 0, recipients: to.length, skipped: [String(error.message ?? error)] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[];
  const origin = publicOrigin();
  let announced = 0;
  const skipped: string[] = [];

  for (const a of rows) {
    const b = a.exp_bookings ?? {};
    const qty = Number(a.quantity) > 1 ? Number(a.quantity) : null;
    const vars = {
      guestName: String(b.contacts?.name ?? "").trim() || b.contacts?.email || "A guest",
      guestEmail: b.contacts?.email ?? "",
      addonLabel: `${qty ? `${qty} × ` : ""}${a.label ?? "an add-on"}`,
      addonPrice: money(a.price, b.exp_experiences?.currency) ?? "",
      experienceTitle: b.exp_experiences?.title ?? "their trip",
      editionLabel: b.exp_editions?.label ?? "",
      dates: fmtRange(b.exp_editions?.date_start, b.exp_editions?.date_end) ?? "",
      adminLink: `${origin}/admin/bookings/${a.booking_id}`,
    };
    for (const r of to) {
      const res = await sendEmail({
        to: r.email,
        templateKey: "team_addon_requested",
        vars,
        manual: true,
        bookingId: a.booking_id,
        dedupeKey: `team:addon_requested:${a.id}:${r.email.toLowerCase()}`,
      }).catch((e) => ({ status: "error" as const, error: e instanceof Error ? e.message : String(e) }));
      if (res.status === "sent") announced++;
      else if (res.status !== "skipped") skipped.push(`${r.email}: ${res.error ?? "failed"}`);
    }
  }
  return { looked: rows.length, announced, recipients: to.length, skipped };
}
