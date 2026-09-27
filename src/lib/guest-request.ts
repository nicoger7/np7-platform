/**
 * The free-text request a guest sends from their trip page ("Any other
 * requests?", /api/portal/extra-nights).
 *
 * It has no table of its own. The route appends one stamped line to the
 * booking's notes, and until now that line was the whole record: nobody was
 * told, and the only way to find it was to open that booking and read the notes
 * (Nico, 27 Sep 2026: the team gets a mail for every sign-up and request).
 *
 * WHY NOT AN ADD-ON ROW
 *
 * The obvious fix is to file it as a `requested` exp_booking_addons row, so the
 * add-on alert and the confirm/decline buttons cover it. It does not fit. An
 * add-on row is a MONEY line: invoices, the payment plan, the balance and the
 * member's own extras list all read it. This is free text ("vegan, and can we
 * land a day later?") with no component and no price. A row for it would show
 * up on the guest's add-on list and, the day somebody pressed Confirm, as a
 * zero-euro line on an invoice. So the note stays the record, and a sweep reads
 * it (src/lib/email/team-alerts-guests.ts).
 *
 * The writer and the reader live in this one file, so they can never spell the
 * line differently. Pure: no database, safe anywhere.
 */

/** The marker in every request line. Old rows carry it too, so it cannot change. */
export const GUEST_REQUEST_MARK = "EXTRA-NIGHTS / FLIGHT REQUEST";

/** `2026-09-28 14:05`, UTC, the stamp the note has always carried. */
export function requestStamp(at: Date = new Date()): string {
  return at.toISOString().slice(0, 16).replace("T", " ");
}

/** The line the route appends to exp_bookings.notes. */
export function guestRequestNote(o: { at?: Date; from: string; message: string }): string {
  const text = String(o.message ?? "").slice(0, 500) || "(member requested extra nights / different flight dates)";
  return `[${requestStamp(o.at)}] ${GUEST_REQUEST_MARK} from ${o.from}: ${text}`;
}

export type GuestRequest = {
  /** ISO time of the request, to the minute. */
  at: string;
  from: string;
  message: string;
  /** Stable per request: the minute, a hash of the sender and the request's
   *  place among the request lines with that same minute. Two requests in one
   *  minute are two keys, a rerun finds the same key, and nothing staff add to
   *  the notes afterwards moves it (see guestRequestsIn). */
  key: string;
};

/** A short, stable, non-cryptographic hash (djb2). Only tells senders apart,
 *  and keeps a guest's name out of the dedupe key in email_log. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const LINE = /\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})\] EXTRA-NIGHTS \/ FLIGHT REQUEST from (.*?): ([\s\S]*?)(?=\n\[|$)/g;

/**
 * Every request line in a booking's notes made at or after `sinceISO`.
 *
 * A message can run over several lines (the box is a textarea), so a request
 * runs until the next stamped line, not the next newline. The stamp is cut to
 * the minute, so the window is too: a request made in the same minute as
 * `since` is still inside it.
 */
export function guestRequestsIn(notes: string | null | undefined, sinceISO?: string | null): GuestRequest[] {
  const text = String(notes ?? "");
  if (!text.includes(GUEST_REQUEST_MARK)) return [];
  const floor = sinceISO ? new Date(sinceISO) : null;
  if (floor) floor.setUTCSeconds(0, 0);
  const out: GuestRequest[] = [];
  // How many request lines with each stamp came before this one. Counted over
  // every line, before the window check, so the count never depends on it.
  const seenAtStamp = new Map<string, number>();
  for (const m of text.matchAll(LINE)) {
    const stamp = `${m[1].replace(/-/g, "")}${m[2].replace(":", "")}`;
    const n = seenAtStamp.get(stamp) ?? 0;
    seenAtStamp.set(stamp, n + 1);
    const at = `${m[1]}T${m[2]}:00.000Z`;
    if (floor && new Date(at) < floor) continue;
    const from = m[3].trim();
    const message = m[4].trim();
    out.push({
      at,
      from,
      message,
      // NOT a hash of the message (review, 28 Sep 2026). The message runs to
      // the next stamped line or the end of the notes, so a plain line staff
      // typed under it in the admin's free-text notes became part of the
      // message, changed the hash, and the same request was mailed again.
      // The stamp, the sender and the place among same-minute lines do not
      // change when text is added below.
      key: `${stamp}-${hash(from)}-${n}`,
    });
  }
  return out;
}
