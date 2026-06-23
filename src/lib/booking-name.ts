/**
 * The standard human-readable booking label, used everywhere a booking is
 * created (website reserve/register + admin quick-add) so they all read the same
 * in lists — and identically to the bookings imported from Notion:
 *   "Name — Place Year - Week".
 *
 *   composeBookingName({ contactName: "Stephan Swart", experienceTitle: "NP7 Experience Bonaire",
 *                        year: 2026, editionLabel: "Week I" })
 *   → "Stephan Swart — Bonaire 2026 - Week I"
 *
 * The "NP7 Experience " / "NP7 " brand prefix is stripped so the label stays the
 * short place (matches the existing imported convention). Missing parts are
 * dropped gracefully (no stray dashes); a booking with no edition info just falls
 * back to the contact's name.
 */
export function composeBookingName(opts: {
  contactName?: string | null;
  experienceTitle?: string | null;
  editionLabel?: string | null;
  year?: number | string | null;
}): string {
  const name = (opts.contactName ?? "").trim();
  // Strip the brand prefix so "NP7 Experience Bonaire" reads as "Bonaire".
  const exp = (opts.experienceTitle ?? "").trim().replace(/^NP7\s+Experience\s+/i, "").replace(/^NP7\s+/i, "");
  const label = (opts.editionLabel != null ? String(opts.editionLabel) : "").trim();
  const year = opts.year != null ? String(opts.year).trim() : "";
  const head = [exp, year].filter(Boolean).join(" "); // "Bonaire 2026"
  const edition = [head, label].filter(Boolean).join(" - "); // "Bonaire 2026 - Week I"
  if (name && edition) return `${name} — ${edition}`;
  return name || edition;
}
