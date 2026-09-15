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

/**
 * Country NAMES, because that is what is actually in the column. `country` is
 * free text typed by a person or carried over from Notion, and it holds
 * "Netherlands", "Norway", "Turkey", "Brasil" and "Minnesota, USA". Reading
 * only two-letter codes threw all of those away and sent the guest to the bank
 * transfer for no reason: 19 of 111 bookers, measured 2026-09-14.
 *
 * Deliberately not a full ISO list. These are the spellings that exist in the
 * data plus the countries NP7 sells to, and anything unrecognised still falls
 * through to the dial code and then to "we cannot tell", which is honest.
 */
const NAME_TO_ISO: Record<string, string> = {
  GERMANY: "DE", DEUTSCHLAND: "DE", NETHERLANDS: "NL", "THE NETHERLANDS": "NL",
  HOLLAND: "NL", NEDERLAND: "NL", BELGIUM: "BE", BELGIE: "BE", BELGIQUE: "BE",
  AUSTRIA: "AT", OESTERREICH: "AT", POLAND: "PL", POLSKA: "PL",
  FRANCE: "FR", ITALY: "IT", ITALIA: "IT", SPAIN: "ES", ESPANA: "ES",
  PORTUGAL: "PT", IRELAND: "IE", DENMARK: "DK", DANMARK: "DK",
  SWEDEN: "SE", SVERIGE: "SE", NORWAY: "NO", NORGE: "NO", FINLAND: "FI",
  ICELAND: "IS", ESTONIA: "EE", LATVIA: "LV", LITHUANIA: "LT",
  CZECHIA: "CZ", "CZECH REPUBLIC": "CZ", SLOVAKIA: "SK", SLOVENIA: "SI",
  HUNGARY: "HU", ROMANIA: "RO", BULGARIA: "BG", GREECE: "GR", CROATIA: "HR",
  LUXEMBOURG: "LU", MALTA: "MT", CYPRUS: "CY",
  SWITZERLAND: "CH", SCHWEIZ: "CH", "UNITED KINGDOM": "GB", UK: "GB",
  ENGLAND: "GB", SCOTLAND: "GB", WALES: "GB", "GREAT BRITAIN": "GB",
  "UNITED STATES": "US", "UNITED STATES OF AMERICA": "US", USA: "US",
  CANADA: "CA", AUSTRALIA: "AU", "NEW ZEALAND": "NZ", BRAZIL: "BR",
  BRASIL: "BR", TURKEY: "TR", TURKIYE: "TR", BAHRAIN: "BH",
  "SOUTH AFRICA": "ZA", ISRAEL: "IL", UAE: "AE",
};

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
  /*
   * Each field is TRIED, not just preferred. `billingCountry ?? country` meant
   * an unreadable billing country shadowed a perfectly good one on the contact,
   * and the guest fell all the way through to their phone for no reason. Only
   * two contacts carry a billing country today, so this has cost nothing yet,
   * and it would have started costing the moment we begin asking for one.
   */
  for (const raw of [c.billingCountry, c.country]) {
    const named = (raw ?? "").trim().toUpperCase();
    if (!named) continue;
    if (named.length === 2 && /^[A-Z]{2}$/.test(named)) return named;
    const byName = NAME_TO_ISO[named];
    if (byName) return byName;
    // "Minnesota, USA" and the like: take the last comma-separated part, which
    // is where people put the country when they write an address into a
    // one-line box.
    const tail = named.split(",").pop()?.trim() ?? "";
    if (NAME_TO_ISO[tail]) return NAME_TO_ISO[tail];
  }
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

/**
 * Which fee band to quote a card guest, from where they are.
 *
 * It used to quote every card guest the international band, 3.15 %, including a
 * guest in the UK whose card actually costs Stripe 2.5 %. §312a Abs. 4 BGB lets
 * a surcharge stand only up to what it actually costs us, so quoting the dearer
 * band to a London guest was 0.65 % above cost and not lawful.
 *
 * Still an estimate, because the guest's country is not the CARD's country: a
 * Londoner can pay with an American card. The webhook reads the real card after
 * the fact and refunds the whole fee if it turns out to be a private EEA card,
 * where no surcharge may stand at all. A card that is merely cheaper than the
 * band quoted is not yet refunded down, which is the remaining gap.
 */
export const cardRegionFor = (country: string | null): "uk" | "intl" =>
  country === "GB" ? "uk" : "intl";

/** The three countries Wero covers, which are the three iDEAL does not. */
const WERO = new Set(["BE", "FR", "DE"]);
