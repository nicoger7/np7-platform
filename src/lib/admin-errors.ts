import "server-only";

/**
 * Database errors, said in a sentence an employee can act on.
 *
 * The admin write routes passed Postgres' own message straight to the screen.
 * Picking a week that had just been deleted answered
 * "insert or update on table \"exp_bookings\" violates foreign key constraint
 * \"exp_bookings_edition_id_fkey\"" — true, and useless to the person holding
 * the phone. The technical text still goes to the server log; the human gets
 * the sentence.
 */

type DbErrorLike = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;

/** Column/constraint → the thing an employee actually calls it. */
const THING: Record<string, string> = {
  edition_id: "week",
  experience_id: "experience",
  contact_id: "guest",
  package_id: "package",
  booking_id: "booking",
  hotel_id: "hotel",
  room_id: "room",
  covered_by_booking_id: "paying booking",
  component_id: "component",
  name: "name",
  amount: "amount",
  price: "price",
  email: "email address",
};

function nameThing(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const key of Object.keys(THING)) if (raw.includes(key)) return THING[key];
  return null;
}

/**
 * Returns a guest-facing sentence for a Postgres error, or null when we have
 * nothing better to say than the original (the caller then keeps its own text).
 */
export function humanDbError(err: DbErrorLike): string | null {
  if (!err) return null;
  const code = String(err.code ?? "");
  const msg = `${err.message ?? ""} ${err.details ?? ""}`;
  const thing = nameThing(msg);

  switch (code) {
    case "23503": // foreign key violation — points at something that isn't there
      return thing
        ? `That ${thing} doesn't exist (any more) — pick it again from the list.`
        : "Something this refers to doesn't exist any more — reload the page and try again.";
    case "23502": // not-null violation
      return thing ? `The ${thing} is required.` : "A required field is missing.";
    case "23505": // unique violation
      return thing ? `That ${thing} is already taken.` : "That already exists.";
    case "22P02": // invalid text representation (bad uuid, bad number)
      return "One of the values isn't in the right format — reload the page and try again.";
    case "23514": // check constraint
      return "That value isn't allowed here.";
    case "42501": // insufficient privilege / RLS
      return "You don't have permission to change this.";
    default:
      return null;
  }
}

/** Log the technical truth, return the human sentence (or the fallback). */
export function dbErrorMessage(err: DbErrorLike, fallback = "Couldn't save — please try again."): string {
  if (err) console.error("[admin] db error:", err.code, err.message, err.details);
  return humanDbError(err) ?? fallback;
}
