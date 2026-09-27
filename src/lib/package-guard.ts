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

/** A package row as far as the sale rule cares. Missing columns are read the
 *  forgiving way: no website_visible means visible, which is the column's own
 *  default (migration 044). */
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
  if (p.website_visible === false && !(p.id && scope.unlocked?.has(p.id))) return "private";
  return null;
}

/** The invite columns the unlock reads. */
export type InviteUnlockRow = {
  package_id?: string | null;
  experience_id?: string | null;
  edition_id?: string | null;
  status?: string | null;
};

/** An invite stops opening anything once it is withdrawn or has run out.
 *  "booked" still counts: the friend who used it may resubmit the same form. */
const DEAD_INVITE = new Set(["cancelled", "expired"]);

/**
 * The private package an invite opens for THIS booking, as a set of ids.
 *
 * Bound to everything the invite itself was bound to: its own package, its own
 * trip, and its own week when it names one. An invite for Bonaire week 3 is
 * not a key to week 4, and not to any other private package on Bonaire,
 * because the inviter only ever passed on the one they are booked on.
 */
export function inviteUnlocks(
  invite: InviteUnlockRow | null | undefined,
  scope: { experienceId: string; editionId: string | null },
): Set<string> {
  if (!invite?.package_id) return new Set();
  if (DEAD_INVITE.has(String(invite.status ?? ""))) return new Set();
  if (!invite.experience_id || invite.experience_id !== scope.experienceId) return new Set();
  if (invite.edition_id && invite.edition_id !== scope.editionId) return new Set();
  return new Set([invite.package_id]);
}

/**
 * Look the invite token up and return what it unlocks. No token, an unknown
 * token or a failed read all unlock nothing: failing closed here costs a guest
 * one "no longer available" and a message to the team, failing open sells a
 * private price to whoever asks.
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
      .select("package_id, experience_id, edition_id, status")
      .eq("token", t)
      .maybeSingle();
    if (error) return new Set();
    return inviteUnlocks(data as InviteUnlockRow | null, scope);
  } catch {
    return new Set();
  }
}
