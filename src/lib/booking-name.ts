/**
 * The standard human-readable booking label, used everywhere a booking is
 * created (website reserve/register + admin quick-add) so they all read the same
 * in lists:  "Name — Experience Year · Week".
 *
 *   composeBookingName({ contactName: "Stephan Swart", experienceTitle: "NP7 Bonaire",
 *                        year: 2026, editionLabel: "Week I" })
 *   → "Stephan Swart — NP7 Bonaire 2026 · Week I"
 *
 * Missing parts are dropped gracefully (no stray dashes), and a booking with no
 * edition info just falls back to the contact's name.
 */
export function composeBookingName(opts: {
  contactName?: string | null;
  experienceTitle?: string | null;
  editionLabel?: string | null;
  year?: number | string | null;
}): string {
  const name = (opts.contactName ?? "").trim();
  const exp = (opts.experienceTitle ?? "").trim();
  const label = (opts.editionLabel != null ? String(opts.editionLabel) : "").trim();
  const year = opts.year != null ? String(opts.year).trim() : "";
  const head = [exp, year].filter(Boolean).join(" "); // "NP7 Bonaire 2026"
  const edition = [head, label].filter(Boolean).join(" · "); // "NP7 Bonaire 2026 · Week I"
  if (name && edition) return `${name} — ${edition}`;
  return name || edition;
}
