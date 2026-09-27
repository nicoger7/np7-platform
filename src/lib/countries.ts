/**
 * Every country, by its English name, for a dropdown and for reading one back.
 *
 * Which ways to pay a guest is offered depends on where they live
 * (payment-methods.ts), and the only place a guest tells us is the billing
 * address box on their trip page. Its country was a free-text field, so a guest
 * who typed "Curaçao" or "Mexico" was still "somewhere we can't tell" and still
 * had no way to pay online after doing exactly what we asked (Nico, 27 Sep
 * 2026: "make it more clear that they need to fill it in to get full payment
 * setup"). A dropdown cannot be misspelt.
 *
 * Built from Intl rather than typed out, and built ON THE SERVER: the page
 * hands the list to the form, so the name a guest picks is the same string the
 * server later reads back. A browser's ICU and Node's can disagree ("Turkey" vs
 * "Türkiye"), and two lists would drift apart silently.
 */

/** Region codes Intl names that are not countries anyone lives in. */
const NOT_A_COUNTRY = new Set(["EU", "EZ", "QO", "UN", "XA", "XB", "ZZ"]);

export type CountryOption = { code: string; name: string };

let cache: CountryOption[] | null = null;

/** Every country Intl can name in English, alphabetical. */
export function countryOptions(): CountryOption[] {
  if (cache) return cache;
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const out: CountryOption[] = [];
  for (let a = 65; a < 91; a++) {
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      if (NOT_A_COUNTRY.has(code)) continue;
      // Retired codes (DY Dahomey, BU Burma, YU Yugoslavia) are named as their
      // successor, so each would appear twice under two codes. Keep the live one.
      try {
        if (Intl.getCanonicalLocales(`und-${code}`)[0] !== `und-${code}`) continue;
      } catch { continue; }
      let name: string | undefined;
      try { name = names.of(code); } catch { continue; }
      if (name && name !== code) out.push({ code, name });
    }
  }
  cache = out.sort((x, y) => x.name.localeCompare(y.name, "en"));
  return cache;
}

let byName: Map<string, string> | null = null;

/** The ISO code for an English country name as the dropdown writes it, or null. */
export function isoFromCountryName(raw: string | null | undefined): string | null {
  const key = (raw ?? "").trim().toUpperCase();
  if (!key) return null;
  if (!byName) byName = new Map(countryOptions().map((c) => [c.name.toUpperCase(), c.code]));
  return byName.get(key) ?? null;
}

/**
 * Countries with no postcode, or none in everyday use. A guest in Curaçao or
 * Bonaire cannot type one, and a box that insists on it cannot be saved, which
 * for the payment setup means they can never pay online. The list follows
 * Google's address data (libaddressinput), which is what Stripe's own address
 * form uses to drop the field.
 */
const NO_POSTCODE = new Set([
  "AE", "AG", "AO", "AW", "BF", "BI", "BJ", "BO", "BQ", "BS", "BW", "BZ", "CD",
  "CF", "CG", "CI", "CK", "CM", "CW", "DJ", "DM", "ER", "FJ", "GA", "GD", "GH",
  "GM", "GQ", "GY", "HK", "JM", "KI", "KM", "KN", "KP", "LC", "ML", "MO", "MR",
  "MW", "NR", "NU", "QA", "RW", "SB", "SC", "SL", "SR", "ST", "SX", "SY", "TD",
  "TF", "TG", "TK", "TL", "TO", "TT", "TV", "UG", "VU", "YE", "ZW",
]);

/** Whether an address in this country (a code or an English name) has a
 *  postcode to ask for. Anything we cannot place is assumed to have one. */
export function usesPostcode(country: string | null | undefined): boolean {
  const raw = (country ?? "").trim().toUpperCase();
  const code = /^[A-Z]{2}$/.test(raw) ? raw : isoFromCountryName(raw);
  return !(code && NO_POSTCODE.has(code));
}
