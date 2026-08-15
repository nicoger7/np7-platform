/**
 * IBAN validation — because a wrong one is silent until a customer can't pay.
 *
 * NP7's own IBAN sat in company settings 2 digits short of a German IBAN's
 * fixed 22 characters. It printed on every invoice, and nothing anywhere
 * checked it. The first person to notice was a customer, by voice message,
 * after their bank rejected the transfer — which means every bank-transfer
 * invoice issued until then was unpayable.
 *
 * Two independent checks, because each catches what the other misses:
 *   - LENGTH, per country. A German IBAN is always 22; the short one above
 *     would have been caught here instantly.
 *   - MOD-97 checksum (ISO 7064). Catches typos and transposed digits that
 *     happen to be the right length.
 *
 * Neither can tell you the IBAN belongs to the right account — only the bank
 * can. This says "impossible", never "correct".
 */

/** IBAN length by country. Not exhaustive — the ones NP7 plausibly banks in. */
const IBAN_LENGTH: Record<string, number> = {
  DE: 22, AT: 20, CH: 21, NL: 18, BE: 16, FR: 27, ES: 24, IT: 27,
  PT: 25, LU: 20, DK: 18, SE: 24, NO: 15, FI: 18, PL: 28, IE: 22,
  GB: 22, TR: 26, GR: 27, CZ: 24, HU: 28, RO: 24, HR: 21, SI: 19,
};

export const normalizeIban = (raw: string): string =>
  raw.replace(/[\s-]/g, "").toUpperCase();

/** ISO 7064 mod-97: a valid IBAN leaves a remainder of exactly 1. */
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const part = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of part) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder;
}

export type IbanCheck = { ok: true } | { ok: false; reason: string };

/** Empty is allowed — an IBAN nobody has entered yet is not an invalid one. */
export function checkIban(raw: string | null | undefined): IbanCheck {
  if (!raw || !raw.trim()) return { ok: true };
  const iban = normalizeIban(raw);

  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
    return { ok: false, reason: "An IBAN starts with two country letters and two check digits, e.g. DE89…" };
  }
  const country = iban.slice(0, 2);
  const expected = IBAN_LENGTH[country];
  if (expected && iban.length !== expected) {
    return {
      ok: false,
      reason: `A ${country} IBAN is ${expected} characters — this one is ${iban.length}. ${
        iban.length < expected
          ? `${expected - iban.length} digit${expected - iban.length === 1 ? " is" : "s are"} missing. Check it against a bank statement.`
          : `${iban.length - expected} too many.`
      }`,
    };
  }
  if (mod97(iban) !== 1) {
    return { ok: false, reason: "That IBAN fails its own checksum — a digit is wrong or two are swapped. Copy it from your bank." };
  }
  return { ok: true };
}

export const isValidIban = (raw: string | null | undefined): boolean => checkIban(raw).ok;
