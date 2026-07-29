// EAN-13 / GTIN helpers.
//
// A GTIN is never invented: it is <GS1 company prefix><item reference><check
// digit>, 13 digits total, and the prefix must be licensed to NP7 (retailers
// verify the owner in GS1's GEPIR registry). The prefix length is set by the
// package you buy — a small package means a longer prefix and fewer available
// item references — so capacity is always derived, never hardcoded.

/** Mod-10 check digit for the first 12 digits of an EAN-13. */
export function checkDigit(first12: string): number {
  const digits = first12.split("").map(Number);
  // From the left, 1-indexed: odd positions ×1, even positions ×3.
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** How many GTINs a prefix can ever issue (12 digits minus the prefix). */
export function prefixCapacity(prefix: string): number {
  const free = 12 - prefix.length;
  return free > 0 ? 10 ** free : 0;
}

/** Build the full EAN-13 from a prefix and a numeric item reference. */
export function buildEan13(prefix: string, reference: number): string {
  const free = 12 - prefix.length;
  const body = prefix + String(reference).padStart(free, "0");
  return body + String(checkDigit(body));
}

export type GtinCheck = { valid: boolean; reason?: string; normalized?: string };

/** Validate a typed-in EAN-8/13 (factory-assigned codes come in this way). */
export function validateEan(raw: string): GtinCheck {
  const code = (raw || "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(code)) return { valid: false, reason: "Digits only." };
  if (code.length !== 13 && code.length !== 8) {
    return { valid: false, reason: `${code.length} digits — an EAN has 13 (or 8 for tiny packs).` };
  }
  const body = code.slice(0, -1);
  const given = Number(code.slice(-1));
  const expected = code.length === 13 ? checkDigit(body) : checkDigit8(body);
  if (given !== expected) {
    return { valid: false, reason: `Check digit should be ${expected} — this code won't scan.` };
  }
  return { valid: true, normalized: code };
}

/** EAN-8 uses the mirrored weighting (×3 first). */
function checkDigit8(first7: string): number {
  const sum = first7.split("").map(Number).reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

/** Pretty display: 4260123 45678 9 → grouped like a printed barcode. */
export function formatEan(code: string, prefixLen?: number): string {
  if (code.length !== 13) return code;
  const p = prefixLen && prefixLen < 12 ? prefixLen : 7;
  return `${code.slice(0, p)} ${code.slice(p, 12)} ${code.slice(12)}`;
}

// ── Barcode rendering (module bit-string for an SVG) ─────────────────────────

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
// The first digit isn't drawn as bars — it's encoded in the L/G parity of the left half.
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** EAN-13 → module string ("1" = bar). Returns null for an invalid code. */
export function ean13Modules(code: string): string | null {
  if (!validateEan(code).valid || code.length !== 13) return null;
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let out = "101"; // left guard
  for (let i = 0; i < 6; i++) out += parity[i] === "L" ? L[d[i + 1]] : G[d[i + 1]];
  out += "01010"; // centre guard
  for (let i = 0; i < 6; i++) out += R[d[i + 7]];
  out += "101"; // right guard
  return out;
}
