/**
 * The Beschreibung line on a lexoffice Beleg.
 *
 *   P25 | NP7-XP-2026-0184 | Teneriffa | Abreise 14.02.2027 | DRITTLAND | Rate 1 von 2
 *
 * This is not a comment. Since 01.01.2022 the margin under § 25 must be
 * determined for each trip individually, and lexoffice has no field anywhere
 * that can tie a booking entry to one trip: no category, no tax key, no custom
 * field, and the vendor states outright that Lexware Office cannot represent
 * margin taxation at all. The description field is the only place the link
 * fits. Everything the tax practice needs to rebuild the per-trip margin has
 * to survive in this one string.
 *
 * Each part earns its place:
 *   P25            marks the entry as belonging to the margin scheme at a glance
 *   the number     ties the Beleg back to the NP7 PDF, and is what lexoffice's
 *                  own bank matching searches for in the Verwendungszweck
 *   the place      names the trip in the words a human uses
 *   Abreise        separates two runs of the same trip, which the place cannot
 *   DRITTLAND/EU   third-country margin is tax free, EU margin is taxable in
 *                  the month the money arrives. Different returns, different
 *                  money. UNKLAR is a real answer and means "ask the practice"
 *   Rate n von m   an instalment is its own Beleg, and without this the two
 *                  halves of one trip price look like two separate sales
 */

import type { VatTerritory } from "./territory";

export type RemarkParts = {
  invoiceNumber: string;
  /** The place, as a person would say it: "Teneriffa", "Bonaire". */
  place: string;
  /** ISO departure date, or null when the document has no trip behind it. */
  departure: string | null;
  territory: VatTerritory;
  /** "Rate 1 von 2", "Zusatzleistung", "Storno" — what this Beleg is within the trip. */
  stage: string | null;
  /** For a credit note: the number of the invoice being reversed. */
  reverses?: string | null;
};

/** German date, because a German bookkeeper reads this field. */
export function germanDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10).split("-");
  if (d.length !== 3) return null;
  return `${d[2]}.${d[1]}.${d[0]}`;
}

export function buildRemark(p: RemarkParts): string {
  const bits: string[] = [p.reverses ? "P25 STORNO" : "P25", p.invoiceNumber];
  if (p.reverses) bits.push(`zu ${p.reverses}`);
  bits.push(p.place);
  const dep = germanDate(p.departure);
  if (dep) bits.push(`Abreise ${dep}`);
  bits.push(p.territory);
  if (p.stage) bits.push(p.stage);
  return bits.join(" | ");
}

/**
 * Which instalment this document is, in words a bookkeeper can act on.
 *
 * A trip is paid in stages and each stage is its own Beleg, so "Rate 1 von 2"
 * is the only thing distinguishing two entries that otherwise look identical.
 * The count comes from the real payment plan rather than from counting invoices
 * already issued, because when the first instalment is pushed the second one
 * does not exist yet.
 *
 * An add-on is deliberately NOT given a Rate. It is not a share of the trip
 * price, it is an extra bought on top, and numbering it as an instalment would
 * make the trip look like it had more stages than it was sold with.
 */
export function stageLabel(
  type: string,
  plan: { kind: string }[],
): string | null {
  if (type === "addon_invoice") return "Zusatzleistung";
  if (type === "credit_note") return null;
  const kind =
    type === "deposit_invoice" ? "deposit"
    : type === "downpayment_invoice" ? "downpayment"
    : type === "final_invoice" ? "final"
    : null;
  if (!kind) return null;
  const idx = plan.findIndex((m) => m.kind === kind);
  // A stage the plan does not contain means the invoice and the plan disagree —
  // most often a package whose deposit was later set to zero. Saying nothing is
  // better than saying "Rate 0 von 2".
  if (idx < 0 || plan.length === 0) return null;
  // A trip bought outright, like a one-day clinic, has one stage and calling it
  // "Rate 1 von 1" reads as though a second were coming.
  if (plan.length === 1) return "Vollzahlung";
  return `Rate ${idx + 1} von ${plan.length}`;
}
