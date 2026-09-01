/**
 * One display line for a package component on the website / invoice
 * included-list.
 *
 * Components are priced per unit — a hotel room component is ONE night — and
 * packages carry the multiplier in exp_package_components.quantity.
 *
 * So the Website text is written for ONE of the thing, and the count comes from
 * the quantity. Writing the number into the text is the trap: "6 nights in
 * Hotel Playa Surf" at quantity 7 rendered "6 nights in Hotel Playa Surf — 7
 * nights", and it silently lied on every package that used a different length.
 *
 * Write:  night in Hotel Playa Surf     → 7 ⇒ "7 nights in Hotel Playa Surf"
 *         Lunch on the beach            → 6 ⇒ "6× Lunch on the beach"
 *
 * `{n}` gives full control when the sentence needs it — "breakfast on {n} of
 * the 7 mornings" — and suppresses every automatic rule.
 */

/**
 * "night" → "nights", "Lunch" → "Lunches", "day" → "days". Leaves plurals be.
 *
 * The "leaves plurals be" rule used to sit LAST and could never fire: the -es
 * rule above it matched every word ending in s, so anything already plural got
 * a second ending. A component written "nights at the only beachfront hotel"
 * rendered "6 nightses at the only beachfront hotel" on the Tenerife package.
 *
 * Order matters, and so does telling -s from -ss. A word ending in a single s
 * is already plural (nights, days); one ending in ss, x, z, ch or sh is a
 * singular that takes -es (class, box, lunch).
 */
function pluralise(word: string): string {
  if (/ss$|[xz]$|(ch|sh)$/i.test(word)) return `${word}es`;
  if (/s$/i.test(word)) return word;            // already plural — leave it alone
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

export function includeLine(c: {
  name?: string | null;
  description?: string | null;
  category?: string | null;
  quantity?: number | null;
}): string {
  const text = (c.description || c.name || "").trim();
  if (!text) return "";
  const qty = Math.max(1, Math.round(Number(c.quantity) || 1));

  // Explicit placeholder wins — the author has said exactly where the number
  // goes, so nothing else is applied.
  if (text.includes("{n}")) return text.replace(/\{n\}/g, String(qty));

  if (qty === 1) return text;

  // "night in Hotel Playa Surf" → "7 nights in Hotel Playa Surf". Only when the
  // line opens with a bare word we can pluralise; anything else keeps the old
  // "6× …" form, which is never wrong, only plainer.
  const m = /^([A-Za-zÀ-ÿ]+)(\s|$)/.exec(text);
  const isCountable = /acco|meal|food|transfer|coach|rental|gear|activity/i.test(c.category ?? "");
  if (m && isCountable) {
    return `${qty} ${pluralise(m[1])}${text.slice(m[1].length)}`;
  }
  return `${qty}× ${text}`;
}
