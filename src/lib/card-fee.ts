/**
 * Paying by card, on request, and who carries the card cost.
 *
 * Bank transfer is the default and is always free. A card link is made by
 * hand for the guest who asks for one, and the card cost may be passed on
 * only where the law allows it:
 *
 *   §270a BGB (PSD2 Art. 62 (4)): no surcharge at all on SEPA transfers,
 *   SEPA direct debits, and consumer debit/credit cards issued in the EEA
 *   (the cards the Interchange Fee Regulation caps). A free alternative does
 *   not unlock it; the ban is absolute for those instruments.
 *
 *   Everything else, commercial cards (business, corporate, purchasing: the
 *   IFR's own carve-out, Art. 1(3)(a)), three-party schemes such as American
 *   Express and Diners (Art. 1(3)(c)), UK cards and cards issued outside the
 *   EEA, may carry a fee under §312a Abs. 4 BGB: a common free
 *   way to pay must exist (the bank transfer) and the fee may not exceed the
 *   cost the card actually causes. That is what KLM does: a card fee on the
 *   cards it is allowed on, iDEAL or SEPA free beside it.
 *
 * A private Gold or Platinum card is still a consumer card and stays under
 * the ban, whatever Stripe charges for it.
 *
 * The cost is Stripe's own price for a German account (stripe.com/de/pricing,
 * read 2026-09-14), grossed up so the trip is credited the full amount after
 * Stripe takes its cut of the total. Shared by the admin dialog and the API,
 * which re-derives the fee itself and never trusts the browser's number.
 */
export type CardRegion = "eea" | "amex" | "eea_premium" | "uk" | "intl";

export const CARD_REGIONS: { key: CardRegion; label: string; pct: number; fixed: number; surcharge: boolean; note: string }[] = [
  { key: "eea", label: "Private card issued in the EEA (incl. Gold, Platinum)", pct: 0.015, fixed: 0.25, surcharge: false,
    note: "No fee may be added on a private EEA card, premium or not (§270a BGB). NP7 carries Stripe's cost." },
  { key: "amex", label: "American Express or Diners", pct: 0.028, fixed: 0.25, surcharge: true,
    note: "Amex and Diners are three-party schemes, outside the IFR and so outside §270a: a fee is allowed on them, private card or not. Priced at Stripe's premium band; check the first real Amex charge in the dashboard and correct this if it differs." },
  { key: "eea_premium", label: "Business or corporate card, EEA", pct: 0.028, fixed: 0.25, surcharge: true,
    note: "Business, corporate and purchasing cards are outside the ban; the fee is Stripe's 2.8 % + €0.25, at cost. A private Gold or Platinum card is NOT this bucket." },
  { key: "uk", label: "Card issued in the UK", pct: 0.025, fixed: 0.25, surcharge: true,
    note: "UK cards are outside the EEA ban; the fee is Stripe's 2.5 % + €0.25, at cost." },
  { key: "intl", label: "Card issued outside the EEA and UK", pct: 0.0315, fixed: 0.25, surcharge: true,
    note: "Cards from outside the EEA and UK (USA, Canada, Switzerland, Turkey) are outside the ban; the fee is Stripe's 3.15 % + €0.25, at cost." },
];

export const isCardRegion = (v: unknown): v is CardRegion => CARD_REGIONS.some((r) => r.key === v);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The EEA: the EU plus Norway, Iceland and Liechtenstein. Not the UK, not
 *  Switzerland. ISO-3166 alpha-2, the codes Stripe reports on a card. */
const EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO",
]);

/** Three-party schemes: outside the IFR, so outside the §270a ban. */
const THREE_PARTY = new Set(["amex", "american_express", "diners", "discover", "jcb", "unionpay"]);

/**
 * May a fee stand on the card that was actually used?
 *
 * The admin picks a fee bucket before anyone has seen the card, which is a
 * legal classification of an object they cannot inspect. Stripe reports the
 * truth on the charge: issuing country and brand. This is the check that runs
 * afterwards, and it errs towards NO: a card we cannot identify, or an EEA card
 * of any funding type, is treated as protected, because charging a fee that is
 * forbidden is a worse error than carrying a cost.
 *
 * What it cannot see is whether an EEA card is a commercial one (Stripe reports
 * funding as credit/debit/prepaid, never "business"), so an EEA corporate card
 * is refunded its fee too. That is the safe direction.
 */
export function feeAllowedOnCard(card: { country?: string | null; brand?: string | null } | null): boolean {
  if (!card?.country) return false;
  const brand = String(card.brand ?? "").toLowerCase();
  if (THREE_PARTY.has(brand)) return true;
  return !EEA.has(String(card.country).toUpperCase());
}

/**
 * The fee for a card family, grossed up: Stripe charges pct + fixed on the
 * TOTAL the guest pays, so total = (amount + fixed) / (1 − pct) leaves exactly
 * `amount` for the trip. Zero where a surcharge is not allowed.
 */
export function cardFee(amount: number, region: CardRegion): { fee: number; total: number } {
  const r = CARD_REGIONS.find((x) => x.key === region);
  if (!r || !r.surcharge || !(amount > 0)) return { fee: 0, total: r2(amount) };
  const total = r2((amount + r.fixed) / (1 - r.pct));
  return { fee: r2(total - amount), total };
}
