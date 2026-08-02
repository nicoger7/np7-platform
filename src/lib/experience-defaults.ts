/**
 * The generic copy every experience starts with.
 *
 * These used to live as fallback constants in the page: if a field was empty,
 * the page quietly rendered the default instead. That made them invisible —
 * you couldn't see them in the admin, so you couldn't edit them, and an
 * experience that had never been written looked finished.
 *
 * They are now seeded into `exp_content` so they can be edited like any other
 * copy. Keeping them here as well gives us the one thing the seed took away:
 * a way to tell "written for this trip" from "still the words every other trip
 * has". A field that still equals its default has, by definition, not been
 * touched — no extra column or bookkeeping needed.
 */

export const DEFAULT_WEEK_TITLE = "The best week of your windsurf year";

export const DEFAULT_METHOD_INTRO =
  "Nico's proven coaching approach, developed teaching hundreds of thousands of windsurfers through YouTube and camps worldwide. Complex movements, broken into clear, actionable steps — tailored to you.";

export type OutcomeItem = { icon?: string; t?: string; d?: string };
export type MethodStep = { t?: string; d?: string; gameChanger?: boolean };
export type ProgramItem = { title?: string; description?: string };
export type FaqItem = { q?: string; a?: string };

export const DEFAULT_OUTCOMES: OutcomeItem[] = [
  { icon: "bolt", t: "Real confidence on the water", d: "Comfortable in more wind and chop than you arrived in — stance locked, fear gone." },
  { icon: "gauge", t: "Control & speed", d: "Effortless, controlled, faster riding — from straight-line speed to clean transitions." },
  { icon: "rotate", t: "Better jibes", d: "The move everyone wants, broken into steps that finally click." },
  { icon: "idea", t: "A year's worth of knowledge", d: "Maneuver know-how, equipment insights, and your personal roadmap for what to work on next." },
  { icon: "globe", t: "Friends from all over the world", d: "A small, hand-picked group of people who love this as much as you do." },
  { icon: "camera", t: "Your week on photo & video", d: "We shoot the whole week — you take the proof home." },
];

export const DEFAULT_METHOD_STEPS: MethodStep[] = [
  { t: "Structured coaching scheme", d: "Every session builds on the last. Level groups, clear progression, no random tips — a system that compounds through the week.", gameChanger: false },
  { t: "Daily focus points", d: "You always know the one thing to work on next session. Simple, personal, and it sticks.", gameChanger: false },
  { t: "Video analysis", d: "We film you on the water and break it down frame-by-frame each evening. Seeing yourself is what makes it click — riders call it the single biggest unlock of the week.", gameChanger: true },
];

export const DEFAULT_DAILY_PROGRAM: ProgramItem[] = [
  { title: "Arrival · Registration · Warm-up", description: "Land, transfer to your hotel and settle into the vibe. Collect your gear and ease into your first session — no pressure, just feel the spot." },
  { title: "First coaching block + baseline video", description: "Level groups are set. Morning on-water coaching, then your first video analysis so we know exactly where you're starting from." },
  { title: "Technique day + sunset session", description: "Focused drills on your personal goals, followed by an optional golden-hour freeride and a group dinner." },
  { title: "Activity morning + afternoon ride", description: "A break from the straps: explore the destination, then back on the water when the wind fills in." },
  { title: "Big progression day", description: "Everything comes together. Longer sessions, more video, and you'll feel the jump compared to day one." },
  { title: "Final session + farewell", description: "One last ride with your new crew, a wrap-up of your focus points to take home, and a farewell dinner." },
];

export const DEFAULT_FAQ: FaqItem[] = [
  { q: "What's not included?", a: "Flights, airport transfers and dinners. Book your own flights (we'll guide you on the best arrival times), we're happy to arrange your airport transfer for you, and dinners are out together as a group — everyone covers their own." },
  { q: "I'm travelling solo — will I fit in?", a: "Absolutely — most guests come alone. Shared meals and a friendly crew mean you'll know everyone by day two." },
  { q: "What level do I need to be?", a: "Anything from total beginner to semi-pro. We group by level so you're always with the right people." },
  { q: "Is gear included?", a: "Yes — pro windsurf gear rental is included in every package. Bring your own harness if you like." },
  { q: "Can I arrive earlier or leave later?", a: "Yes — you can add extra hotel nights with us at any time after booking. Just tell us your flight dates and we'll arrange it." },
  { q: "How does booking work?", a: "Reserve your spot in seconds — just your name and contact details, nothing more. We then contact you personally to sort every detail, and you pay by invoice: a down-payment to secure your place, with the balance due before the trip." },
];

/** Recursively sort object keys, so jsonb round-trips compare equal. Postgres
 *  normalizes key order ({q,a} comes back {a,q}), which made a plain
 *  JSON.stringify comparison NEVER match — the "still generic" checks sat
 *  green on 13/13 experiences whose content was byte-identical to the default. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  }
  return v;
}

/** "Nobody has touched this" — one edited word and it stops counting as the
 *  default. Empty counts as default too: the page renders the built-in copy
 *  when the field is null or [], which is exactly the situation the check
 *  exists to surface. */
export function sameAsDefault(value: unknown, def: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  try {
    return JSON.stringify(canonical(value)) === JSON.stringify(canonical(def));
  } catch {
    return false;
  }
}
