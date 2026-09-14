/**
 * Which ways to pay a given guest is actually shown.
 *
 * Stripe has two modes, and the first attempt at this used the wrong one.
 *
 * Name the methods and Stripe shows that exact list to everybody, wherever they
 * are, because naming them is the same as saying "do not filter". Name nothing
 * and hand it a dashboard CONFIGURATION instead, and it works out where the
 * guest is from their connection and shows only what they can finish. It knows
 * this the moment the page loads, long before any card is typed.
 *
 * The first attempt named five rails, and the bill came in on 14 Sep 2026: a
 * German member pressed Pay and was handed iDEAL's Dutch bank list. iDEAL is
 * the Netherlands and nowhere else. Stripe renamed it "iDEAL | Wero" while the
 * schemes merge, which is what made it look like it covered Germany. The
 * customer countries did not move. Wero is its own method (`wero`), customers
 * in BE, FR and DE, and NP7 has not been granted it yet.
 *
 * So Stripe does the filtering now, from a rails-only configuration. Two things
 * still live here, because they are NP7's decisions and not Stripe's:
 *
 * 1. Whether to draw a Pay button at all. A guest whose country has no rail
 *    would open a checkout with nothing on it, so they are better sent to the
 *    bank transfer already printed on their invoice. Stripe cannot know that
 *    the transfer exists.
 *
 * 2. Whether a card may be offered. A surcharge on a private EEA card is
 *    forbidden (§270a BGB), so inside the EEA NP7 would carry about 1.5 %,
 *    roughly €22 on a €1,440 securing payment, against €0.29 for a rail. Nico's
 *    call, and he made it: no card where we carry the fee. Outside the EEA the
 *    surcharge is lawful, the fee goes on its own line, and the webhook refunds
 *    it by itself if the card turns out to be an EEA private one after all,
 *    because the country here is inferred and an inference has to be allowed to
 *    be wrong without costing the guest anything.
 *
 * The card is kept OUT by leaving it out of the rails configuration rather than
 * by excluding it per payment: Apple Pay, Google Pay and Link ride on the card
 * and Stripe will not let you exclude those per payment, so excluding the card
 * alone would leak the same 1.5 % through a wallet.
 *
 * Wero needs no code change when Stripe grants it. Switch it on in that
 * configuration and BE, FR and DE start seeing it. The only line to touch here
 * is the rail list below, which decides whether their button is drawn.
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
  /** Their country has a rail: hand Stripe the configuration and let it pick. */
  rails: boolean;
  /** No rail, but a card fee is lawful here, so offer the card with the fee. */
  card: boolean;
  /** Said to the guest when nothing is offered, in their words not ours. */
  unavailable: string | null;
};

/** True when there is any way at all to pay this guest's booking online. */
export const canPayOnline = (m: OnlineMethods) => m.rails || m.card;

const NOTHING_EEA = "Your bank's instant payment isn't available in your country yet, so a transfer is the way. The details are on your invoice below.";
const NOTHING_UNKNOWN = "We can't tell which instant payments your country has. A transfer works from anywhere, the details are on your invoice below.";

/**
 * Countries with a rail in the configuration. Not the method names: Stripe
 * picks those. Only "is there anything here worth opening a checkout for".
 *
 * Belgium is here on its own account, not on Wero's: Bancontact is Belgian,
 * enabled, and older than Wero. It was briefly left out because BE is also a
 * Wero country, which is true and irrelevant. Add FR and DE the day Wero is
 * granted; Belgium keeps Bancontact either way.
 */
const HAS_RAIL = new Set(["NL", "BE", "AT", "PL"]);

/** What this guest may be shown, given where they are. */
export function onlineMethodsFor(country: string | null): OnlineMethods {
  const weroLive = process.env.STRIPE_WERO_ENABLED === "true";
  if (!country) return { rails: false, card: false, unavailable: NOTHING_UNKNOWN };
  if (HAS_RAIL.has(country) || (weroLive && WERO.has(country))) {
    return { rails: true, card: false, unavailable: null };
  }
  // Outside the EEA there is no rail worth wiring and the fee is lawful, so the
  // card is the honest offer. Inside it, the bank transfer stands.
  return EEA.has(country)
    ? { rails: false, card: false, unavailable: NOTHING_EEA }
    : { rails: false, card: true, unavailable: null };
}

/** The three countries Wero covers, which are the three iDEAL does not. */
const WERO = new Set(["BE", "FR", "DE"]);
