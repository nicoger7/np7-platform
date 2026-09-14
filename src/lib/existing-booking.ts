import "server-only";
import { isAttending, isLostStatus, normalizeBookingStatus } from "@/lib/types";

/**
 * "Is this person already on this week?" One answer, one query, one rule.
 *
 * Nothing guarded the signup against a repeat: /api/register looked the contact
 * up by email and then inserted a booking unconditionally, and so did every
 * companion. A guest who reloaded after submitting, or who came back a week
 * later having forgotten, got a second lead, a second pro-forma PDF, a second
 * payment plan and a second row in open revenue.
 *
 * The payer and every companion are judged here, BEFORE a single row is
 * written, so the server is the authority and the two paths can never drift.
 * The decision is split from the query on purpose: the two pure helpers are
 * where the rules actually live, and they are unit-testable without a DB.
 *
 * One shape is deliberately NOT a duplicate: a lead with no package. That row
 * is somebody who asked to be told when the week goes live (/api/week-interest
 * files exactly that, and so does every Notion-era CRM lead), and registering
 * is them completing their own ask. Treating it as "already booked" locked the
 * guest out of the week permanently: nothing clears an empty lead, so Anna
 * could ask in January, watch the prices land in March, and never be able to
 * sign up for it at all.
 */

/** What the guard needs off a booking row, and nothing more. */
export type LiveBookingRow = {
  id: string;
  contact_id: string;
  package_id: string | null;
  status: string | null;
  created_at: string;
  covered_by_booking_id: string | null;
  /** Both only exist here for isEmptyLead and the completion that follows it:
   *  a price somebody negotiated is the proof a human owns this row, and the
   *  note is appended to rather than replaced. */
  agreed_price: number | null;
  notes: string | null;
};

/**
 * Two submissions of the same thing within a minute are one intent, not two
 * bookings. Anything slower is somebody deliberately coming back.
 */
export const DOUBLE_SUBMIT_WINDOW_MS = 60_000;

/**
 * How far the database clock may run AHEAD of the function clock before a
 * booking looks like it was created in the future.
 *
 * created_at is stamped by Postgres (now()) and compared against Date.now() in
 * a Vercel function in another machine's clock domain. A few ms of skew turned
 * a genuine double click into "you already have a booking for this week",
 * because a negative age failed the window test and fell through to conflict.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5_000;

/**
 * Does this row still count as being on the week?
 *
 * `lost` is the ONLY status excluded, and it goes through isLostStatus so the
 * legacy Notion spellings normalise: a row still reading "cancelled" is lost
 * too. Counting lost as live would have turned a real customer away, and the
 * DB says so plainly: Derek Rotz cancelled Bonaire Week III in June and
 * rebooked a fortnight later, confirmed.
 */
export function isLiveBooking(row: { status?: string | null } | null | undefined): boolean {
  return !!row && !isLostStatus(row.status);
}

/**
 * Every live booking these contacts already hold on this week, oldest first,
 * keyed by contact.
 *
 * The key is the EDITION when there is one, else the experience with a null
 * edition: "this trip" to a guest is the week they picked, and keying on the
 * experience alone would refuse a repeat customer next year's Bonaire, which
 * is the business.
 *
 * Best-effort by design. A guard that fails closed would cost a real booking
 * every time the query hiccups, which is the same argument the bot check at
 * src/app/api/register/route.ts already makes about false positives.
 */
export async function findLiveBookings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  scope: { contactIds: string[]; experienceId: string; editionId: string | null },
): Promise<Map<string, LiveBookingRow>> {
  const out = new Map<string, LiveBookingRow>();
  const ids = [...new Set(scope.contactIds.filter(Boolean))];
  if (!ids.length) return out;

  try {
    let q = db
      .from("exp_bookings")
      .select("id,contact_id,package_id,status,created_at,covered_by_booking_id,agreed_price,notes")
      .in("contact_id", ids);
    /*
     * No `.is("archived_at", null)` here, and it must stay that way. exp_bookings
     * has no such column. Migration 20260621_039_soft_delete_archive.sql adds it
     * to nine tables and not this one, so PostgREST rejects the whole query and
     * hands back an empty result that reads like "nothing found". That exact
     * mistake made the nightly job at src/app/api/cron/booking-status/route.ts
     * report success for months while doing nothing, and it is why the duplicate
     * guard in /api/week-interest has never once fired. Cancellation is carried
     * by the `lost` status, which isLiveBooking already excludes.
     */
    q = scope.editionId
      ? q.eq("edition_id", scope.editionId)
      : q.eq("experience_id", scope.experienceId).is("edition_id", null);
    const { data, error } = await q.order("created_at", { ascending: true });
    if (error) return out;

    for (const row of (data ?? []) as LiveBookingRow[]) {
      if (!isLiveBooking(row)) continue;
      const held = out.get(row.contact_id);
      /*
       * First wins: the query is oldest-first, so a guest is always pointed at
       * their original booking rather than at a later stray.
       *
       * With one exception, and it is the exception that keeps the completion
       * rule honest. An empty lead never speaks for somebody who ALSO holds a
       * real booking on the week: hers would be the older row, so /api/register
       * would complete it and leave her holding two live bookings on the same
       * week, which is the very thing this module exists to prevent. It happens
       * for real, because src/app/api/event/checkout/route.ts reuses only rows
       * whose notes start "Event ticket (" and inserts beside anything else, and
       * because the team creates bookings by hand off a lead. The same
       * preference is what makes the warm screen's "Open my trip" land on a trip
       * page that has a package and a plan.
       */
      if (!held || (isEmptyLead(held) && !isEmptyLead(row))) out.set(row.contact_id, row);
    }
  } catch {
    return out;
  }
  return out;
}

/**
 * The contacts behind these addresses, oldest match per address.
 *
 * Oldest wins, case-insensitively, which is the rule /api/register,
 * createCompanionBookings and /api/portal/register each spell out by hand.
 *
 * A loop of at most seven (the payer plus six companions) rather than one
 * `or=(email.ilike.…)` filter: the email pattern the group form accepts
 * (EMAIL_RE in group-register.ts) permits commas and parentheses in a local
 * part, and those are the separators PostgREST's filter syntax is built from.
 */
export async function resolveContactIdsByEmail(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  emails: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = [...new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter(Boolean))];
  for (const email of wanted) {
    try {
      const { data } = await db
        .from("contacts").select("id").ilike("email", email)
        .order("created_at", { ascending: true }).limit(1);
      const id = data?.[0]?.id;
      if (id) out.set(email, id as string);
    } catch {
      /* one unresolved address must not cost the whole roster its check */
    }
  }
  return out;
}

/**
 * A row that holds a week without holding anything else: "tell me when this is
 * live", filed as a booking because the lead pipeline is where follow-ups live.
 *
 * Four conditions, and all four are deliberate. No package and no price is the
 * whole shape /api/week-interest writes, and the shape a CRM lead has. `lead`
 * excludes a confirmed or paid row with a missing package, which is a data
 * oddity a human should look at rather than something to write over. Covered
 * excludes the guest whose spot sits on a friend's plan: asking her to
 * register would be asking for money that is not hers.
 *
 * A price means somebody negotiated it by hand, and that is somebody's work.
 * Same argument src/app/api/event/checkout/route.ts makes about reusing a row
 * only when its notes prove the route itself wrote it.
 */
export function isEmptyLead(row: LiveBookingRow | null | undefined): boolean {
  return !!row
    && row.package_id == null
    && row.covered_by_booking_id == null
    && row.agreed_price == null
    && normalizeBookingStatus(row.status) === "lead";
}

/**
 * What an already-existing booking means for the submission in hand.
 *
 * An EMPTY LEAD IS NOT A BOOKING, and this returns "none" for it. A row with no
 * package, no price and no payer is somebody asking to be told when the week
 * goes live, and registering is them answering their own question, so it must
 * never lock them out. It must also never be COMPLETED in place, which is the
 * design this replaced and the reason the replacement exists: /api/register is
 * public and identifies the caller from a typed email string, so writing to an
 * existing booking row there would let anyone who knows an address overwrite
 * that person's booking. There were 29 such rows in production carrying real
 * addresses. An insert-only public endpoint stays insert-only.
 *
 * The stale lead is left where it is, as the CRM row it always was. It costs a
 * tidy-up in admin and nothing else: findLiveBookings already prefers a real
 * booking over an empty lead for the same contact, so the guard reads the right
 * row from the moment the real one exists.
 *
 * "same-submission" is a reload or a double click: the same package, seconds
 * old. It is answered with the FIRST booking's id, so the guest lands on the
 * real thing instead of minting a second one. Anything else is a person
 * deliberately booking the same week twice, which is the conflict.
 */
export function classifyExistingBooking(args: {
  row: LiveBookingRow | null | undefined;
  packageId: string;
  now: number;
}): "none" | "same-submission" | "conflict" {
  const { row, packageId, now } = args;
  if (!row) return "none";
  if (isEmptyLead(row)) return "none";
  if (row.package_id !== packageId) return "conflict";
  const age = now - Date.parse(row.created_at);
  if (Number.isFinite(age) && age >= -CLOCK_SKEW_TOLERANCE_MS && age <= DOUBLE_SUBMIT_WINDOW_MS) return "same-submission";
  return "conflict";
}

/**
 * Postgres' unique_violation. The one-live-booking-per-person-per-week index
 * (supabase/migrations/20260915_246_one_live_booking_per_person_per_week.sql)
 * is the only thing that can close the read-then-insert race, and it is NOT
 * applied yet: it waits on Nico's call about the two duplicate rows already in
 * production. Handling the code now means applying it later needs no code
 * change, and means the day it lands a racing double tap gets the warm screen
 * instead of "Could not complete your registration".
 */
export const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === UNIQUE_VIOLATION;
}

/**
 * Add a line to a booking's notes without losing what is already there.
 *
 * A completed lead keeps the fact that it started as "tell me when this is
 * live", and a lead an employee typed by hand keeps every word of it. Same
 * argument src/app/api/event/checkout/route.ts makes when it reuses a row:
 * somebody's work is never overwritten.
 */
export function appendBookingNote(existing: string | null | undefined, addition: string): string {
  const before = (existing ?? "").trim();
  return before ? `${before} · ${addition}` : addition;
}

/**
 * Which of the three warm screens this booking deserves.
 *
 * "covered" beats any status because a guest somebody else is paying for has
 * nothing to do either way, and telling them to secure their spot would ask
 * them for money that is not theirs to pay.
 */
export function existingBookingKind(row: LiveBookingRow): "covered" | "secured" | "pending" {
  if (row.covered_by_booking_id) return "covered";
  return isAttending(row.status) ? "secured" : "pending";
}
