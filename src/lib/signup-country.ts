import { countryOptions, isoFromCountryName } from "@/lib/countries";

/**
 * The guest's country, asked at trip sign-up (Nico, 27 Sep 2026: "yes").
 *
 * Which ways to pay online a guest is offered depends on where they live
 * (payment-methods.ts, onlineMethodsFor + guestCountry). Sign-up asked for a
 * name and an email only, so about one guest in four arrived with no country
 * and no phone, and their trip page could offer them no way to pay online
 * until they found and filled the billing address box. One dropdown at sign-up,
 * pre-selected from where they are browsing, closes that gap before it opens.
 *
 * Three small rules live here so the route, the geo endpoint and the tests all
 * read the same ones.
 */

/** Every code the dropdown offers, for checking an edge header against. */
let known: Set<string> | null = null;
const isKnownCode = (code: string) => (known ??= new Set(countryOptions().map((c) => c.code))).has(code);

/**
 * Where the request comes from, as the ISO code of a country the dropdown
 * offers, or null.
 *
 * Only Vercel's own header, which it sets at the edge from the connecting IP.
 * The IP itself is never read here, so it cannot end up stored or echoed.
 * Anything that is not a real country code ("XX", "T1" for Tor, an empty
 * header on localhost) is null, and the dropdown simply starts unselected.
 */
export function edgeCountry(headers: Pick<Headers, "get">): string | null {
  const raw = (headers.get("x-vercel-ip-country") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw)) return null;
  return isKnownCode(raw) ? raw : null;
}

/**
 * A submitted country, as the English name the dropdown writes, or null.
 *
 * Accepts the name itself or its two-letter code, and always hands back the
 * name from countryOptions(): that is the string guestCountry reads back, so
 * what lands in contacts.country is guaranteed to switch on paying online.
 * Anything else, free text included, is dropped rather than stored.
 */
export function signupCountryName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 80) return null;
  const code = /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : isoFromCountryName(s);
  if (!code) return null;
  return countryOptions().find((c) => c.code === code)?.name ?? null;
}

/**
 * What to write into contacts.country: the submitted country, and only into an
 * EMPTY field. null means write nothing.
 *
 * Never an overwrite, and that is what makes it safe on a public endpoint.
 * /api/register knows a guest only by the email somebody typed, so a sign-up
 * for someone else's address must not be able to change what that person told
 * us. Filling a blank is the most it can do, and the billing country the guest
 * sets on their own trip page still wins over it in guestCountry.
 */
export function countryToFill(current: string | null | undefined, submitted: unknown): string | null {
  if ((current ?? "").trim()) return null;
  return signupCountryName(submitted);
}

/**
 * Fill the contact's country from the sign-up, when it is empty. Best effort:
 * a failure here must never cost a registration, so it reports and never
 * throws.
 *
 * The update is conditional on the value just read (compare and set), so a
 * country saved from the trip page in the same moment is not overwritten.
 */
export async function fillContactCountry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  contactId: string | null | undefined,
  submitted: unknown,
): Promise<boolean> {
  if (!contactId || !signupCountryName(submitted)) return false;
  try {
    const { data: c, error } = await db.from("contacts").select("country").eq("id", contactId).maybeSingle();
    if (error || !c) return false;
    const fill = countryToFill(c.country as string | null, submitted);
    if (!fill) return false;
    const base = db.from("contacts").update({ country: fill }).eq("id", contactId);
    const { error: uErr } = await (c.country == null ? base.is("country", null) : base.eq("country", c.country));
    return !uErr;
  } catch {
    return false;
  }
}
