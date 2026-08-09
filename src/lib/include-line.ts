/**
 * One display line for a package component on the website / invoice
 * included-list.
 *
 * Components are priced per unit — a hotel room component is ONE night — and
 * packages carry the multiplier in exp_package_components.quantity. Both
 * included-list builders ignored it, so a package with "Double Room" × 6 read
 * as if it included a single night, and there was nowhere to say otherwise
 * short of hand-writing the manual Website list.
 *
 * Accommodation counts in nights ("… — 6 nights"); everything else in units
 * ("6× Lunch"). Quantity 1 renders exactly as before.
 */
export function includeLine(c: {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  quantity?: number | null;
}): string {
  const text = (c.description || c.name || "").trim();
  if (!text) return "";
  const qty = Math.max(1, Math.round(Number(c.quantity) || 1));
  if (qty === 1) return text;
  const isAccommodation = /acco/i.test(c.category ?? "");
  return isAccommodation ? `${text} — ${qty} nights` : `${qty}× ${text}`;
}
