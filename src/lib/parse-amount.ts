/**
 * Read a money amount the way a human typed it — European or English notation,
 * with or without a currency symbol.
 *
 * Why this exists: the admin formats money with `toLocaleString()`, so on a
 * German machine the balance reads "€3.845" meaning three thousand eight
 * hundred forty-five. Typing that back into a plain `<input type="number">`
 * fails twice over: the "€" makes the whole field invalid (the browser reports
 * an empty value, so the form looks stuck with no explanation), and even
 * without it `Number("3.845")` is 3.85 — a four-figure payment silently
 * recorded as pocket change.
 *
 * Rules, in order:
 *   · strip everything that isn't a digit, separator or minus
 *   · BOTH separators present → the last one is the decimal point
 *     ("3.845,50" → 3845.50, "1,234.56" → 1234.56)
 *   · ONE separator followed by exactly three digits → thousands separator
 *     ("3.845" → 3845, "1.234.567" → 1234567)
 *   · otherwise it's a decimal point ("3.84" → 3.84, "0.125" → 0.125)
 *
 * Returns null when there is no number in there at all, so callers can tell
 * "nothing typed yet" from "typed a zero".
 */
export function parseAmount(raw: string): number | null {
  const s = String(raw ?? "").replace(/[^\d.,\-]/g, "").trim();
  if (!s || !/\d/.test(s)) return null;

  const negative = s.trimStart().startsWith("-");
  const body = s.replace(/-/g, "");
  const lastDot = body.lastIndexOf(".");
  const lastComma = body.lastIndexOf(",");
  const strip = (v: string) => v.replace(/[.,]/g, "");

  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    normalized = `${strip(body.slice(0, dec))}.${strip(body.slice(dec + 1))}`;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const i = Math.max(lastDot, lastComma);
    const head = body.slice(0, i);
    const tail = body.slice(i + 1);
    // "3.845" is a thousands group; "3.84" and "0.125" are decimals. A leading
    // zero is never a thousands group, so 0.125 stays 0.125.
    const isThousands = /^\d{3}$/.test(tail) && head !== "" && strip(head) !== "0";
    normalized = isThousands ? strip(body) : `${strip(head) || "0"}.${tail}`;
  } else {
    normalized = body;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** How the parsed amount will actually be stored — echo it back to the typist. */
export function formatAmount(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
