import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { publicOrigin } from "@/lib/public-origin";
import { isWeekInterest } from "@/lib/week-interest";
import { getCoveredBookings } from "@/lib/group-booking";
import { isAttending, isLostStatus } from "@/lib/types";
import type { EmailVars } from "@/lib/email/templates";
import type { Division } from "@/lib/email/layout";

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
  /* The newer sweeps live in team-alerts-guests.ts and team-alerts-hardware.ts;
     this list stays the one registry (Nico, 28 Sep 2026: the team hears about
     every sign-up and every order). */
  {
    key: "payment_received",
    title: "A payment comes in",
    blurb: "A guest paid online (card or bank transfer through Stripe) or used a gift voucher on a booking. Who, which trip, how much, and how. Bank transfers straight to our account are not in this yet.",
    templateKey: "team_payment_received",
  },
  {
    key: "transfer_failed",
    title: "A bank transfer fails or falls short",
    blurb: "Stripe reports a payment that bounced, or a transfer where only part of the money arrived. The guest probably thinks they have paid, and the spot is not held.",
    templateKey: "team_transfer_failed",
  },
  {
    key: "addon_requested",
    title: "A guest asks for an add-on",
    blurb: "A guest asked for something from their trip page (an extra night, a lesson, a transfer) and it is waiting for someone to confirm or decline it.",
    templateKey: "team_addon_requested",
  },
  {
    key: "guest_request",
    title: "A guest sends a request",
    blurb: "A guest wrote to us from their trip page (\"Any other requests?\"): extra nights, other flight dates, food, anything. It is saved in the booking notes and waits for a reply.",
    templateKey: "team_guest_request",
  },
  {
    key: "cancellation_requested",
    title: "A guest asks to cancel",
    blurb: "A guest pressed Cancel this trip. Nothing is cancelled or refunded until we do it, and what they get back depends on what they have paid.",
    templateKey: "team_cancellation_requested",
  },
  {
    key: "widerruf_received",
    title: "A withdrawal (Widerruf) comes in",
    blurb: "Someone used the withdrawal form on the website. It is a legal declaration, and the clock runs from the moment it arrived.",
    templateKey: "team_widerruf_received",
  },
  {
    key: "interest_signup",
    title: "Someone joins a waiting list",
    blurb: "A visitor asked to be told when a week without packages goes on sale. Who, which week, and how many are now waiting for it.",
    templateKey: "team_interest_signup",
  },
  {
    key: "account_signup",
    title: "Someone makes an account",
    blurb: "A visitor made an NP7 account and, a quarter of an hour later, has not booked anything. Anyone who books in that time gets the booking mail instead, never both.",
    templateKey: "team_account_signup",
  },
  {
    key: "signature_application",
    title: "A Signature Trip application",
    blurb: "Someone applied for a Signature Trip and confirmed their email address. It waits for someone to look at it and decide.",
    templateKey: "team_signature_application",
  },
  {
    key: "review_submitted",
    title: "A guest writes a review",
    blurb: "A guest wrote or changed a review of their trip. Nothing shows on the website until someone approves it.",
    templateKey: "team_review_submitted",
  },
  /* Not a sweep: /api/voucher sends it the moment the order lands (see
     sendVoucherOrdered in src/lib/vouchers/notify.ts). A voucher order has one
     door, so there is no seventh route to forget, and the team should hear
     before the transfer does (Nico, 27 Sep 2026). */
  {
    key: "voucher_ordered",
    title: "Someone orders a gift voucher",
    blurb: "A gift voucher was ordered on the website and waits for its bank transfer. Who ordered it, how much, the reference to look for, and whether Nico is to call the recipient.",
    templateKey: "team_voucher_ordered",
  },
  /* Hardware. The shop is hidden until launch and nobody is on these yet: Nico
     has not said who gets them (28 Sep 2026). They exist so the alerts are
     already there the day the shop opens. */
  {
    key: "hw_order_placed",
    title: "Hardware · a shop order",
    blurb: "Someone ordered in the NP7 Hardware web shop. It waits for the bank transfer, and the stock is held for it until then.",
    templateKey: "team_hw_order_placed",
  },
  {
    key: "hw_return_requested",
    title: "Hardware · a return request",
    blurb: "A customer asked to send something back, as a withdrawal or a warranty claim. Someone has to approve it and receive the goods.",
    templateKey: "team_hw_return_requested",
  },
  {
    key: "hw_enquiry",
    title: "Hardware · a product enquiry",
    blurb: "Someone asked about a product through the form on a product page. They are waiting for a reply, and nothing has been sent to them.",
    templateKey: "team_hw_enquiry",
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

/** Whole euros stay whole; anything with cents shows both digits, so a
 *  €1,399.50 payment never reads as "€1,399.5". */
export const money = (n: number | string | null | undefined, cur = "EUR") => {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return null;
  const v = Number(n);
  const cents = Math.abs(v - Math.round(v)) > 0.001;
  return `${cur === "EUR" ? "€" : cur + " "}${v.toLocaleString("en-US", cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined)}`;
};

export const fmtRange = (start?: string | null, end?: string | null) => {
  if (!start) return null;
  const s = new Date(start), e = end ? new Date(end) : null;
  const d = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return e ? `${d(s)} - ${d(e)} ${e.getFullYear()}` : `${d(s)} ${s.getFullYear()}`;
};

export type SweepResult = { looked: number; announced: number; recipients: number; skipped: string[] };

/** What a sweep with nobody subscribed returns: it did not even look. */
export const nobody = (): SweepResult => ({ looked: 0, announced: 0, recipients: 0, skipped: ["nobody is subscribed"] });

/**
 * One alert to everyone on an event's list.
 *
 * Always `manual`: this is mail to us, and it must not wait behind the
 * soft-launch gate that holds guest mail. Always deduped on
 * `team:<event>:<what>:<address>`, so a sweep can run as often as it likes and
 * an overlapping run announces nothing twice. Never a guest: `to` only ever
 * comes from team_mail_recipients.
 */
export async function mailTeam(
  to: TeamRecipient[],
  m: { event: TeamEventKey; what: string; templateKey: string; vars: EmailVars; bookingId?: string | null; division?: Division },
  tally: { announced: number; skipped: string[] },
): Promise<void> {
  for (const r of to) {
    const res = await sendEmail({
      to: r.email,
      templateKey: m.templateKey,
      vars: m.vars,
      manual: true,
      bookingId: m.bookingId ?? null,
      ...(m.division ? { division: m.division } : {}),
      dedupeKey: `team:${m.event}:${m.what}:${r.email.toLowerCase()}`,
    }).catch((e) => ({ status: "error" as const, error: e instanceof Error ? e.message : String(e) }));
    if (res.status === "sent") tally.announced++;
    else if (res.status !== "skipped") tally.skipped.push(`${r.email}: ${res.error ?? "failed"}`);
  }
}

/** A person's name for a mail, never blank. */
export const whoIs = (name?: string | null, email?: string | null, fallback = "Someone") =>
  String(name ?? "").trim() || String(email ?? "").trim() || fallback;

/**
 * Is this booking row a booking somebody just made?
 *
 * The sweep reads every row that lands in exp_bookings, and not every row is
 * news. Besides lost rows and companions (always skipped), three kinds would
 * have been mailed as "X just booked" (Nico, 27 Sep 2026):
 *  · status attended: a trip that already happened, typed in after the fact;
 *  · [ARCHIVE] rows: pre-platform trips backfilled for the loyalty ladder (ten
 *    so far, and the next import would mail every one of them);
 *  · TEST bookings, by name or by note.
 * The waiting list is not decided here: it has its own mail and its own check.
 */
export function isBookingNews(b: {
  status?: string | null;
  covered_by_booking_id?: string | null;
  name?: string | null;
  notes?: string | null;
  contacts?: { name?: string | null } | null;
}): boolean {
  const status = String(b.status ?? "").toLowerCase();
  if (status === "lost" || status === "attended") return false;
  if (b.covered_by_booking_id) return false;
  const name = String(b.name ?? "");
  const notes = String(b.notes ?? "");
  if (/^\s*\[ARCHIVE\]/i.test(name) || notes.includes("[ARCHIVE]")) return false;
  // Whole words (review, 28 Sep 2026): a bare /test booking/ also matched
  // "latest booking" and "contest booking", so a real booking whose note said
  // "moved from his latest booking" was silently never announced.
  if ([name, notes, String(b.contacts?.name ?? "")].some((t) => /\btest booking\b/i.test(t))) return false;
  return true;
}

/**
 * Has this booking been secured with money, as far as a friend reward cares?
 * A deposit or a down-payment received, the balance paid, or a status that
 * only comes after one of those (confirmed, paid; legacy spellings through
 * isAttending).
 */
export function isInviteBookingSecured(b: {
  status?: string | null;
  deposit_received?: boolean | null;
  downpayment_received?: boolean | null;
  final_payment_received?: boolean | null;
}): boolean {
  if (isLostStatus(b.status)) return false;
  return !!b.deposit_received || !!b.downpayment_received || !!b.final_payment_received || isAttending(b.status);
}

/**
 * The invite line in the booking mail.
 *
 * It used to say "a friend reward is now due" on every booking with an
 * invite_id (review, 28 Sep 2026). The register route attaches the invite to a
 * free lead sign-up and to a plain info request too, so the team was told to
 * issue two vouchers for someone who had paid nothing or only asked a
 * question. The reward is owed once the friend's booking is secured, so the
 * line says that, and says "not yet" until it is.
 */
export function inviteRewardLine(
  inviter: string | null,
  b: Parameters<typeof isInviteBookingSecured>[0] & { notes?: string | null },
): string {
  const whose = inviter ? `${inviter}'s` : "a friend's";
  if (isInviteBookingSecured(b)) return `Came through ${whose} invite, so a friend reward is now due.`;
  // The register route writes "friend invite (info request)" for intent "info".
  if (/info request/i.test(String(b.notes ?? ""))) return `Asked for info through ${whose} invite. No reward yet.`;
  return `Came through ${whose} invite. The friend reward becomes due once they pay.`;
}

/** The register routes write "BOT-CHECK FLAGGED" into the notes when Vercel
 *  BotID flags a sign-up. It never blocks, so somebody has to look first. */
export const isBotFlagged = (notes?: string | null) => /bot[- ]check flagged/i.test(String(notes ?? ""));

/**
 * What the booking mail needs beyond the booking row itself (Nico, 27 Sep 2026):
 *  · a bot-check warning, because a flagged sign-up otherwise reads like any
 *    other booking and gets invoiced;
 *  · who invited them, because a friend booking through an invite means a
 *    two-sided reward is now owed, and nothing else tells anyone;
 *  · for a group payer, who else is on the booking and what the whole group
 *    comes to. "Worth" alone is only the payer's own seat.
 *
 * Every lookup is best effort: a failed read leaves its line out, it never
 * stops the mail. The invite is read on its own, NOT embedded, because
 * trip_invites has two foreign keys to contacts and two to exp_bookings, and a
 * short embed across an ambiguous key answers 300 instead of rows.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bookingExtras(db: any, b: any, currency: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (isBotFlagged(b.notes)) out.botCheck = "Bot check flagged, verify before invoicing.";

  if (b.invite_id) {
    try {
      const { data: inv } = await db.from("trip_invites")
        .select("id,inviter_contact_id").eq("id", b.invite_id).maybeSingle();
      let inviter: string | null = null;
      if (inv?.inviter_contact_id) {
        const { data: c } = await db.from("contacts").select("name,email").eq("id", inv.inviter_contact_id).maybeSingle();
        inviter = String(c?.name ?? "").trim() || c?.email || null;
      }
      out.inviteLine = inviteRewardLine(inviter, b);
    } catch { /* leave the line out */ }
  }

  try {
    const covered = await getCoveredBookings(db, b.id);
    if (covered.length) {
      out.companions = covered.map((c) => c.guestName || "a guest without a name yet").join(", ");
      const group = (Number(b.agreed_price) || 0) + covered.reduce((s, c) => s + c.total, 0);
      out.groupTotal = `${money(group, currency)} for ${covered.length + 1} people`;
    }
  } catch { /* leave the lines out */ }
  return out;
}

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
    .select("id,created_at,status,name,agreed_price,covered_by_booking_id,package_id,invite_id,notes,deposit_received,downpayment_received,final_payment_received,contacts(name,email),exp_experiences(title,currency),exp_editions(label,date_start,date_end),exp_packages(name)")
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
    // A lost booking, a companion somebody else is paying for (the payer's own
    // mail names the whole group), a trip that already happened, an archive
    // backfill or a test is not a new booking arriving.
    if (!isBookingNews(b)) continue;
    // A waiting-list sign-up is a lead row too, but nobody booked anything:
    // it has its own mail, to its own list (sweepInterestSignups below).
    if (isWeekInterest(b)) continue;

    const currency = b.exp_experiences?.currency ?? "EUR";
    const vars = {
      guestName: String(b.contacts?.name ?? "").trim() || b.contacts?.email || "Someone",
      guestEmail: b.contacts?.email ?? "",
      experienceTitle: b.exp_experiences?.title ?? "an NP7 trip",
      editionLabel: b.exp_editions?.label ?? "",
      dates: fmtRange(b.exp_editions?.date_start, b.exp_editions?.date_end) ?? "",
      packageName: b.exp_packages?.name ?? "",
      total: money(b.agreed_price, currency) ?? "",
      bookingStatus: String(b.status ?? "lead"),
      adminLink: `${origin}/admin/bookings/${b.id}`,
      ...(await bookingExtras(db, b, currency)),
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

/**
 * Announce every waiting-list sign-up: somebody asked to be told when a week
 * with no packages on sale yet goes live.
 *
 * These used to go out, if at all, as "New booking" with no package and no
 * price, which reads like a broken booking. They are demand, not bookings, and
 * the useful number is how many people are now waiting for that week (Nico,
 * 27 Sep 2026: "yes simona and me for now").
 */
export async function sweepInterestSignups(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("interest_signup");
  if (!to.length) return { looked: 0, announced: 0, recipients: 0, skipped: ["nobody is subscribed"] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const since = opts?.since ?? new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from("exp_bookings")
    .select("id,created_at,status,package_id,notes,edition_id,contacts(name,email),exp_experiences(title),exp_editions(label,date_start,date_end)")
    .gte("created_at", since)
    .is("package_id", null)
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return { looked: 0, announced: 0, recipients: to.length, skipped: [String(error.message ?? error)] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = ((data ?? []) as any[]).filter((b) => isWeekInterest(b) && String(b.status ?? "").toLowerCase() !== "lost");
  const origin = publicOrigin();
  let announced = 0;
  const skipped: string[] = [];
  const waitingOn = new Map<string, number>();

  for (const b of rows) {
    // How many are waiting on this week now, this sign-up included. A failed
    // count leaves the line out rather than printing a wrong number.
    if (b.edition_id && !waitingOn.has(b.edition_id)) {
      const { data: same, error: countErr } = await db
        .from("exp_bookings").select("id,package_id,notes,status")
        .eq("edition_id", b.edition_id).is("package_id", null);
      if (!countErr) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        waitingOn.set(b.edition_id, ((same ?? []) as any[])
          .filter((r) => isWeekInterest(r) && String(r.status ?? "").toLowerCase() !== "lost").length);
      }
    }
    const waiting = b.edition_id ? waitingOn.get(b.edition_id) : undefined;

    const vars = {
      guestName: String(b.contacts?.name ?? "").trim() || b.contacts?.email || "Someone",
      guestEmail: b.contacts?.email ?? "",
      experienceTitle: b.exp_experiences?.title ?? "an NP7 trip",
      editionLabel: b.exp_editions?.label ?? "",
      dates: fmtRange(b.exp_editions?.date_start, b.exp_editions?.date_end) ?? "",
      waitingCount: waiting ? `${waiting} ${waiting === 1 ? "person is" : "people are"} now waiting for this week.` : "",
      adminLink: `${origin}/admin/bookings/${b.id}`,
    };
    for (const r of to) {
      const res = await sendEmail({
        to: r.email,
        templateKey: "team_interest_signup",
        vars,
        manual: true,
        bookingId: b.id,
        dedupeKey: `team:interest_signup:${b.id}:${r.email.toLowerCase()}`,
      }).catch((e) => ({ status: "error" as const, error: e instanceof Error ? e.message : String(e) }));
      if (res.status === "sent") announced++;
      else if (res.status !== "skipped") skipped.push(`${r.email}: ${res.error ?? "failed"}`);
    }
  }
  return { looked: rows.length, announced, recipients: to.length, skipped };
}
