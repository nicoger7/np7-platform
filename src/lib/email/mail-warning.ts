/**
 * The words behind "this will email a guest".
 *
 * Nico's rule, 14 Sep 2026: "for every action we take in admin, whenever an
 * action sends a mail we should first get a warning and get asked". Until now
 * every button wrote its own sentence, so "Confirm the bank transfer landed and
 * activate this voucher?" never mentioned that two people get a PDF, and
 * pressing Send on an invoice asked nothing at all.
 *
 * The wording lives here, away from React, for two reasons: it is the same
 * wording everywhere so it cannot drift button by button, and it can be checked
 * without a browser.
 *
 * House style: no long dashes, short sentences, name the person.
 */

/** Who a click writes to. */
export type MailAudience =
  /** One named human. A booking's guest, a voucher's buyer. */
  | { kind: "person"; name?: string | null; email?: string | null }
  /** A counted group, e.g. 12 · "secured guests". Zero means nobody. */
  | { kind: "people"; count: number; describe: string }
  /** Nobody, and why. "the template is off", "nobody qualifies right now". */
  | { kind: "none"; why: string };

export const audienceList = (to: MailAudience | MailAudience[] | null | undefined): MailAudience[] =>
  to == null ? [] : Array.isArray(to) ? to : [to];

/** Does this audience actually receive anything? A group of zero does not. */
export function audienceReceives(a: MailAudience): boolean {
  if (a.kind === "none") return false;
  if (a.kind === "people") return a.count > 0;
  /* A person without an address cannot be written to, name or no name. Saying
     "This sends email · Writes to Uwe Baerenz (no email on file)" in the same
     panel is exactly the contradiction this module exists to stop, and Uwe is
     a real booking: no address until his birthday, on purpose. */
  return !!(a.email ?? "").trim();
}

/** True when at least one mail really leaves. */
export const willSend = (to: MailAudience | MailAudience[] | null | undefined): boolean =>
  audienceList(to).some(audienceReceives);

/**
 * One audience in words.
 *
 * A person reads as "Daniel Rainham · daniel@example.com" so the address can be
 * eyeballed for a typo before it is too late. A group reads as "12 secured
 * guests". Nobody reads as the reason nobody gets it.
 */
export function recipientLine(a: MailAudience): string {
  if (a.kind === "none") return a.why;
  if (a.kind === "people") {
    if (a.count <= 0) return `No ${a.describe} qualify right now`;
    return `${a.count} ${a.describe}`;
  }
  const name = (a.name ?? "").trim();
  const email = (a.email ?? "").trim();
  if (name && email) return `${name} · ${email}`;
  if (email) return email;
  if (name) return `${name} (no email on file)`;
  return "Nobody, there is no address on file";
}

/**
 * Why nothing goes out, when nothing does. Null when mail IS leaving.
 *
 * Kept separate from the recipient lines because a control that sends nothing
 * must read calm, not like a warning. Somebody confirming an add-on while the
 * lifecycle pipeline is paused has done nothing wrong.
 */
export function silentReason(to: MailAudience | MailAudience[] | null | undefined): string | null {
  if (willSend(to)) return null;
  const reasons = audienceList(to).map(recipientLine).filter(Boolean);
  return reasons.length ? reasons.join(". ") : "Nobody qualifies right now";
}

/**
 * What to print AFTER the click, so the person who pressed it learns what left.
 *
 * `who` is the recipient for a single send ("Daniel Rainham") and the noun for
 * a group ("secured guests"), which is why the count decides which reading
 * applies. `why` turns a silent result into an explanation instead of a shrug.
 */
export function sentLine(sent: number, who?: string | null, why?: string | null): string {
  const name = (who ?? "").trim();
  if (sent <= 0) return why ? `Nothing sent, ${why}.` : "Nothing sent.";
  if (sent === 1) return name ? `Sent to ${name}.` : "Sent.";
  return name ? `Sent to ${sent} ${name}.` : `Sent to ${sent} people.`;
}
