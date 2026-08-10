/**
 * Who is legally allowed to sign.
 *
 * One definition, shared by the ticket form and the checkout route, because the
 * two must never disagree: the browser decides what to SHOW, the server decides
 * what to ACCEPT. A form that hides the guardian block is a convenience; a
 * server that skips the check is a voidable contract.
 *
 * Age is measured at the event date, not today — someone who turns 18 the week
 * after the clinic is a minor on the water, which is the moment that counts.
 */
export const ADULT_AGE = 18;

/** Age in whole years on `onDate` (default: today). Null when the DOB is unusable. */
export function ageOn(dob: string | null | undefined, onDate?: string | null): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const b = new Date(`${dob}T00:00:00Z`);
  const on = onDate && /^\d{4}-\d{2}-\d{2}$/.test(onDate) ? new Date(`${onDate}T00:00:00Z`) : new Date();
  if (Number.isNaN(b.getTime())) return null;
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const m = on.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** Is the rider under 18 on the day of the event? Null DOB → treated as unknown. */
export function isMinorOn(dob: string | null | undefined, eventDate?: string | null): boolean | null {
  const a = ageOn(dob, eventDate);
  return a == null ? null : a < ADULT_AGE;
}

export type GuardianInput = {
  guardianName?: string | null;
  guardianEmail?: string | null;
  guardianPhone?: string | null;
  guardianRelationship?: string | null;
};

/**
 * Validate a signup. Returns an error message for the buyer, or null when it's
 * good. Deliberately strict about the unknown case: no date of birth means we
 * cannot tell whether a guardian is required, and guessing in that direction is
 * how an unenforceable contract gets written.
 */
export function checkParticipant(
  dob: string | null | undefined,
  eventDate: string | null | undefined,
  g: GuardianInput,
): string | null {
  const minor = isMinorOn(dob, eventDate);
  if (minor === null) return "Please enter the participant's date of birth.";
  const age = ageOn(dob, eventDate);
  if (age != null && (age < 6 || age > 100)) return "That date of birth doesn't look right — please check it.";
  if (!minor) return null;
  if (!(g.guardianName ?? "").trim()) return "A parent or guardian must book for a participant under 18 — please add their name.";
  if (!/\S+@\S+\.\S+/.test((g.guardianEmail ?? "").trim())) return "Please add the parent or guardian's email address.";
  if (!(g.guardianPhone ?? "").trim()) return "Please add a phone number we can reach the parent or guardian on.";
  return null;
}
