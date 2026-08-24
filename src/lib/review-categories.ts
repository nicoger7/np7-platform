/**
 * The category axes a guest can rate on a review — one place, four consumers:
 * the member form renders them, the submit API whitelists them, the admin pool
 * and the public trip page label them. Stored as a jsonb map { key: 1..5 } on
 * exp_reviews.category_ratings.
 *
 * NULL / absent = the review predates categories (every review until Aug 2026).
 * Every surface must treat that as a complete, fine review — the cards looked
 * good without categories for months and must not degrade now.
 */
export type ReviewCategory = {
  key: string;
  label: string;
  /** The one-line explainer under the label in the member form. */
  sub: string;
  /** Only shown when the booking actually had a hotel — a no-hotel guest
   *  cannot judge a room they never slept in. */
  hotelOnly?: boolean;
};

export const REVIEW_CATEGORIES: ReviewCategory[] = [
  { key: "coaching", label: "Coaching", sub: "technique, feedback & video analysis" },
  { key: "vibe", label: "Group & vibe", sub: "the crew — did you leave with new friends?" },
  { key: "offwater", label: "Off-water program", sub: "activities, workshops & evenings" },
  { key: "food", label: "Food & dinners", sub: "lunches and dinners together" },
  { key: "accommodation", label: "Accommodation", sub: "your hotel & room", hotelOnly: true },
  { key: "organization", label: "Organization", sub: "booking, info & transfers — everything around the week" },
];

const KEYS = new Set(REVIEW_CATEGORIES.map((c) => c.key));

/** Whitelist known keys, clamp to integers 1–5; null when nothing valid remains. */
export function sanitizeCategoryRatings(input: unknown): Record<string, number> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!KEYS.has(k)) continue;
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 1 && n <= 5) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

export function categoryLabel(key: string): string {
  return REVIEW_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
