/**
 * A waiting-list sign-up: "tell me when this week goes live".
 *
 * /api/week-interest files it as a plain LEAD booking with no package, so in
 * the table it looks like any other lead. The team needs to tell the two apart
 * (Nico, 27 Sep 2026: waiting-list sign-ups mail Simona and him, not as "New
 * booking"), and the note the route writes is the one thing only it writes. It
 * lives here so the route and the check can never spell it differently.
 */
export const WEEK_INTEREST_NOTE = "Website interest · asked to be emailed when this week's packages go live.";

/** True for a row the waiting-list form wrote and nobody has turned into a
 *  booking yet. Giving it a package is what turns it into one. */
export function isWeekInterest(b: { package_id?: string | null; notes?: string | null }): boolean {
  return !b.package_id && String(b.notes ?? "").startsWith("Website interest");
}
