/**
 * Which ways to pay a given guest is actually shown.
 *
 * Stripe has two modes. Hand it a list of method names and it shows that list
 * to everybody, wherever they are. Hand it nothing and it picks from the ones
 * enabled on the account using the guest's own location. NP7 needs the first,
 * because the second would let Klarna in, so the country filtering that Stripe
 * would have done has to be done here instead.
 *
 * It was not, and the bill came in on 14 Sep 2026: a German member pressed Pay
 * and Stripe handed him iDEAL's Dutch page, "Kies je bank", with no German bank
 * on the list. iDEAL is the Netherlands and nowhere else. Stripe renamed it
 * "iDEAL | Wero" while the schemes merge, which is what made it look like it
 * covered Germany; the customer countries did not move.
 *
 * The rails are national, so the map is national:
 *
 *   NL          iDEAL            €0.29   the scheme everyone there already uses
 *   BE FR DE    Wero             €0.29   a separate Stripe method, see below
 *   AT          EPS              €0.29
 *   PL          BLIK, P24        €0.29
 *   outside the EEA              card, and the fee is charged on
 *   rest of the EEA             nothing online, the bank transfer stands
 *
 * On Wero: it is `wero`, not `ideal`, it covers exactly the three countries
 * iDEAL does not, and on 14 Sep 2026 it was still request-access at Stripe.
 * Naming a method the account cannot use makes Stripe reject the whole session,
 * which would take payment away from the guests it is meant to serve, so it
 * stays behind STRIPE_WERO_ENABLED until the account is actually granted it.
 *
 * On the card: it is deliberately absent inside the EEA. A surcharge on a
 * private EEA card is forbidden (§270a BGB), so NP7 would carry about 1.5 %,
 * roughly €22 on a €1,440 securing payment, against €0.29 for a rail. Nico's
 * rule, and this is his call to make: no card where we carry the fee. Outside
 * the EEA the surcharge is lawful, the fee is added openly, and the webhook
 * refunds it by itself if the card turns out to be an EEA private one after all
 * (the country here is a guess from a dial code, and a guess has to be able to
 * be wrong without costing the guest anything).
 */

/** The dial codes the booking form offers, as countries. */
const DIAL_TO_ISO: [string, string][] = [
  ["+351", "PT"], ["+353", "IE"], ["+358", "FI"], ["+385", "HR"], ["+420", "CZ"],
  ["+30", "GR"], ["+31", "NL"], ["+32", "BE"], ["+33", "FR"], ["+34", "ES"],
  ["+36", "HU"], ["+39", "IT"], ["+41", "CH"], ["+43", "AT"], ["+44", "GB"],
  ["+45", "DK"], ["+46", "SE"], ["+47", "NO"], ["+48", "PL"], ["+49", "DE"],
  ["+90", "TR"], ["+1", "US"],
];

/** Longest prefix first, so +351 is Portugal and not "+3" then Spain. */
const BY_LENGTH = [...DIAL_TO_ISO].sort((a, b) => b[0].length - a[0].length);

/** The EEA plus the places the card rules treat the same way. */
const EEA = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IS", "IE", "IT", "LV", "LI", "LT", "LU", "MT", "NL", "NO", "PL", "PT", "RO",
  "SK", "SI", "ES", "SE",
]);

/**
 * Where the guest is, as well as it can be known without asking again.
 *
 * The billing country is a real answer if somebody typed one. Failing that the
 * dial code is: the booking form makes them pick it from a list, so it is a
 * deliberate choice rather than something parsed out of free text.
 */
export function guestCountry(c: {
  billingCountry?: string | null; country?: string | null; phone?: string | null;
}): string | null {
  const named = (c.billingCountry ?? c.country ?? "").trim().toUpperCase();
  if (named.length === 2 && /^[A-Z]{2}$/.test(named)) return named;
  const phone = (c.phone ?? "").replace(/[^\d+]/g, "");
  if (phone.startsWith("+")) {
    for (const [dial, iso] of BY_LENGTH) if (phone.startsWith(dial)) return iso;
  }
  return null;
}

export type OnlineMethods = {
  /** What to name in `payment_method_types`. Empty means do not offer it. */
  types: string[];
  /** True when a card is the method, so a fee may lawfully be added. */
  card: boolean;
  /** Said to the guest when nothing is offered, in their words not ours. */
  unavailable: string | null;
};

const NOTHING_EEA = "Your bank's instant payment isn't available in your country yet, so a transfer is the way. The details are on your invoice below.";
const NOTHING_UNKNOWN = "We can't tell which instant payments your country has. A transfer works from anywhere, the details are on your invoice below.";

/** What this guest may be shown, given where they are. */
export function onlineMethodsFor(country: string | null): OnlineMethods {
  const weroLive = process.env.STRIPE_WERO_ENABLED === "true";
  const none = (why: string) => ({ types: [], card: false, unavailable: why });
  if (!country) return none(NOTHING_UNKNOWN);
  switch (country) {
    case "NL": return { types: ["ideal"], card: false, unavailable: null };
    case "BE": case "FR": case "DE":
      return weroLive
        ? { types: ["wero"], card: false, unavailable: null }
        : none(NOTHING_EEA);
    case "AT": return { types: ["eps"], card: false, unavailable: null };
    case "PL": return { types: ["blik", "p24"], card: false, unavailable: null };
    default:
      // Outside the EEA there is no rail worth wiring and the fee is lawful,
      // so the card is the honest offer. Inside it, the transfer stands.
      return EEA.has(country)
        ? none(NOTHING_EEA)
        : { types: ["card"], card: true, unavailable: null };
  }
}
