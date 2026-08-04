/**
 * A contact, written so you can tell two of them apart.
 *
 * Names are not unique and people re-book with a new address: the invite
 * search offered two identical "Andre Schallert" rows with nothing to choose
 * between them. The email is what disambiguates, so it travels with the name
 * everywhere a contact is shown in a list.
 *
 * One component rather than the same two lines copied into each picker — the
 * survey search already had the email in hand and dropped it on the floor,
 * which is exactly what happens when a convention lives in several places.
 */

export function ContactLabel({ name, email, note }: { name: string | null; email?: string | null; note?: string | null }) {
  const shown = (name ?? "").trim() || email || "Unnamed";
  // Don't repeat the address when it IS the name — imported rows are often
  // named after their own email prefix.
  const showEmail = email && email !== shown;
  return (
    <span className="block min-w-0">
      <span className="block text-sm admin-heading truncate">
        {shown}
        {note && <span className="admin-faint font-normal"> · {note}</span>}
      </span>
      {showEmail && <span className="block text-xs admin-faint truncate">{email}</span>}
    </span>
  );
}

/** The same idea on one line, for chips and inline mentions. */
export function ContactInline({ name, email }: { name: string | null; email?: string | null }) {
  const shown = (name ?? "").trim() || email || "Unnamed";
  return (
    <>
      {shown}
      {email && email !== shown && <span className="font-normal opacity-60"> · {email}</span>}
    </>
  );
}
