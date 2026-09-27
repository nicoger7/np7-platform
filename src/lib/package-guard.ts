/**
 * May this package be sold from the public site, to this week? One answer for
 * every public door (Nico, 27 Sep 2026).
 *
 * A package with website_visible = false is PRIVATE: the Turkish Locals rate,
 * the Bonaire 2027 rooms that are not on sale yet, a price agreed with one
 * guest. The team sells those from admin, and a member can pass one on through
 * their invite link (/join/[token]), which carries that member's own package.
 * Nobody else is meant to reach one.
 *
 * The experience page never shows a private package, but hiding it was the
 * only thing standing in the way. /api/register, /api/reserve, the companion
 * roster and the public quote all took a package id from the request and
 * checked that it was active and belonged to the trip, nothing more. Anyone
 * holding the id got a booking and a pro-forma at the private price, and the
 * quote answered with the full payment plan for it. Four doors, four slightly
 * different checks, so the rule lives here once and each door asks it.
 *
 * Pure on purpose: the rule is what has to be pinned by tests, and a test
 * should not need a database to say that a hidden package is hidden.
 */
import { isLostStatus } from "@/lib/types";

/** A package row as far as the sale rule cares.
 *
 *  website_visible is read strictly (review follow-up, 28 Sep 2026). The
 *  column is NOT NULL DEFAULT true (migration 044), so a real row always
 *  carries true or false. When the key is missing, the caller forgot to select
 *  it, and the rule treats the package as private rather than guessing
 *  "visible". Guessing was the quiet way back to the leak: drop the column
 *  from one door's select and every private rate is on sale again, with every
 *  test still green because the test fakes do not model column projection. */
export type SalePackageRow = {
  id?: string | null;
  status?: string | null;
  archived_at?: string | null;
  experience_id?: string | null;
  edition_id?: string | null;
  website_visible?: boolean | null;
};

/**
 *  unavailable · no such package, archived, not active, or another trip's
 *  other-week  · pinned to a different week from the one being booked
 *  private     · off the website, and this request holds no invite for it
 */
export type PackageSaleIssue = "unavailable" | "other-week" | "private";

/**
 * Why this package cannot be sold here, or null when it can.
 *
 * The order is deliberate. "unavailable" first, because a draft or archived
 * package is closed whatever link it came through. "private" last, so a guest
 * with a perfectly good invite who picked the wrong week hears about the week,
 * which is the thing they can fix.
 *
 * `unlocked` is the set of private package ids this request may buy, and it
 * only ever comes from invitePackageUnlock below. It opens "private" and
 * nothing else: an invite cannot sell an archived package or another week.
 */
export function packageSaleIssue(
  p: SalePackageRow | null | undefined,
  scope: { experienceId: string; editionId: string | null; unlocked?: ReadonlySet<string> | null },
): PackageSaleIssue | null {
  if (!p || p.archived_at || p.status !== "active" || p.experience_id !== scope.experienceId) return "unavailable";
  // An edition-scoped package belongs to its week only; an edition-less one
  // is shared across weeks. Same rule the experience page renders by.
  if (p.edition_id && p.edition_id !== scope.editionId) return "other-week";
  // Fail closed on a column that was not selected (see SalePackageRow). null
  // is left as it was: the column cannot hold it, and a caller that sends one
  // has at least asked for the column.
  const hidden = p.website_visible === false || p.website_visible === undefined;
  if (hidden && !(p.id && scope.unlocked?.has(p.id))) return "private";
  return null;
}

/** The invite columns the unlock reads. */
export type InviteUnlockRow = {
  package_id?: string | null;
  experience_id?: string | null;
  edition_id?: string | null;
  status?: string | null;
  inviter_booking_id?: string | null;
};

/** The inviter's booking, as far as the unlock cares. `archived_at` is part
 *  of the rule but not of the read: exp_bookings has no such column today (see
 *  invitePackageUnlock), so the check only bites if one is ever added. */
export type InviterBookingRow = {
  id?: string | null;
  status?: string | null;
  package_id?: string | null;
  edition_id?: string | null;
  archived_at?: string | null;
};

/** An invite stops opening anything once it is withdrawn or has run out.
 *  "booked" still counts: the friend who used it may resubmit the same form. */
const DEAD_INVITE = new Set(["cancelled", "expired"]);

/**
 * Does the member who sent the invite still hold the package it passes on?
 *
 * The invite is a copy of the inviter's own seat, so it is only worth what
 * that seat is worth today (review follow-up, 28 Sep 2026). Before this,
 * nothing tied the two together once the link was made: a member could
 * cancel, or be moved to another room, and every /join link they had ever
 * created kept selling the private rate to whoever held it. Creating a link
 * checks only that the booking is theirs, not that it is live
 * (/api/portal/invites), so this is where the seat gets checked, on every use.
 * So the booking has to exist, be the one the
 * invite names, not be cancelled ("lost", or a legacy "cancelled" row, both
 * through isLostStatus), not be archived, and still sit on the very package
 * the invite carries, on the very week the invite names.
 *
 * The week (review, 28 Sep 2026): a private package with no week of its own
 * (the Turkish Locals rate is shared across weeks) stayed on the inviter's
 * booking when the team moved them to another week, so the invite kept
 * opening it for the original week, where the inviter no longer rides. When
 * the invite names a week, the inviter's booking has to be on it.
 *
 * Every missing piece reads as "no". A booking read without its status, its
 * package or (for an invite with a week) its week is a caller's mistake, and
 * the rule does not guess.
 */
export function inviterStillHolds(
  invite: InviteUnlockRow | null | undefined,
  booking: InviterBookingRow | null | undefined,
): boolean {
  if (!invite?.package_id || !invite.inviter_booking_id) return false;
  if (!booking || booking.id !== invite.inviter_booking_id) return false;
  if (booking.archived_at) return false;
  if (typeof booking.status !== "string" || isLostStatus(booking.status)) return false;
  if (invite.edition_id && booking.edition_id !== invite.edition_id) return false;
  return booking.package_id === invite.package_id;
}

/**
 * The private package an invite opens for THIS booking, as a set of ids.
 *
 * Bound to everything the invite itself was bound to: its own package, its own
 * trip, and its own week when it names one. An invite for Bonaire week 3 is
 * not a key to week 4, and not to any other private package on Bonaire,
 * because the inviter only ever passed on the one they are booked on. And
 * bound to the inviter's booking as it stands now (inviterStillHolds), which
 * is why the booking is a required argument: the rule cannot be asked
 * without it.
 */
export function inviteUnlocks(
  invite: InviteUnlockRow | null | undefined,
  inviterBooking: InviterBookingRow | null | undefined,
  scope: { experienceId: string; editionId: string | null },
): Set<string> {
  if (!invite?.package_id) return new Set();
  if (DEAD_INVITE.has(String(invite.status ?? ""))) return new Set();
  if (!invite.experience_id || invite.experience_id !== scope.experienceId) return new Set();
  if (invite.edition_id && invite.edition_id !== scope.editionId) return new Set();
  if (!inviterStillHolds(invite, inviterBooking)) return new Set();
  return new Set([invite.package_id]);
}

/**
 * Look the invite token up and return what it unlocks. No token, an unknown
 * token or a failed read all unlock nothing: failing closed here costs a guest
 * one "no longer available" and a message to the team, failing open sells a
 * private price to whoever asks.
 *
 * Two reads: the invite by its token, then the inviter's booking it points at.
 * The booking read selects id, status, package_id and edition_id (the week,
 * see inviterStillHolds), and deliberately NOT
 * archived_at. exp_bookings has no archived_at column (migration 039 adds it
 * to nine tables and not this one, see lib/existing-booking.ts), and asking
 * for it would make PostgREST refuse the whole read, which here would mean
 * every invite quietly stops opening its package. A removed booking is a real
 * delete (DELETE /api/admin/bookings/[id]), which "the booking exists"
 * covers, and a cancelled one is "lost".
 */
export async function invitePackageUnlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  token: string | null | undefined,
  scope: { experienceId: string; editionId: string | null },
): Promise<Set<string>> {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t || !scope.experienceId) return new Set();
  try {
    const { data, error } = await db
      .from("trip_invites")
      .select("package_id, experience_id, edition_id, status, inviter_booking_id")
      .eq("token", t)
      .maybeSingle();
    if (error || !data) return new Set();
    const invite = data as InviteUnlockRow;
    // No package to pass on, or no booking to pass it on from: nothing to read.
    if (!invite.package_id || !invite.inviter_booking_id) return new Set();
    const { data: booking, error: bookingError } = await db
      .from("exp_bookings")
      .select("id, status, package_id, edition_id")
      .eq("id", invite.inviter_booking_id)
      .maybeSingle();
    if (bookingError) return new Set();
    return inviteUnlocks(invite, booking as InviterBookingRow | null, scope);
  } catch {
    return new Set();
  }
}
