/**
 * When a spot count is worth saying out loud.
 *
 * A number only creates urgency while it is small. "7 spots left" is not a
 * nudge, it is an inventory report — and it actively tells the reader there is
 * no hurry. The trip page learned this the hard way: it summed the weeks and
 * announced "38 spots left" on a trip whose tightest week had two.
 *
 * So: silence above the threshold, and never a raw count above it either.
 */
export const SCARCE_AT = 3;

/**
 * The line for a ticket box, or null when there is nothing urgent to say.
 *
 * Deliberately wordy rather than numeric near the top of the range: "only a few
 * left" carries the feeling without inviting the reader to work out that a few
 * means three. At one spot it gets specific again, because "last spot" is the
 * one count that is more urgent stated than implied.
 *
 * `free` null means the run has no cap — not "sold out", so say nothing.
 */
export function scarcityLabel(free: number | null | undefined): string | null {
  if (free == null) return null;
  if (free <= 0) return "Fully booked";
  if (free === 1) return "Last spot";
  if (free <= SCARCE_AT) return "Only a few spots left";
  return null;
}

/**
 * The count a tile may show, or null for "say nothing about spots".
 *
 * Two rules in one place, because the tiles each carried their own copy of 5
 * and the trip hero used 3, so the same week could read "Only 5 left" on the
 * grid and nothing at all on its own page (Nico, 21 Sep 2026: "we never want to
 * say X places left if X is too high. 3 spots left is maybe good.").
 *
 * `sellable` is the second rule and the reason this is a function rather than a
 * comparison: capacity is counted from the packages themselves, so a week whose
 * packages are all hidden still reports free beds. Bonaire 2027 went live
 * announcing 15, 8 and 8 spots on weeks nobody could buy. No purchasable
 * package, no claim about spots, in either direction.
 */
export function scarceCount(spotsLeft: number | null | undefined, sellable: boolean): number | null {
  if (!sellable || typeof spotsLeft !== "number") return null;
  return spotsLeft > 0 && spotsLeft <= SCARCE_AT ? spotsLeft : null;
}

/** Whether "Fully booked" may be said: only about a week that was ever sellable. */
export function showFullyBooked(spotsLeft: number | null | undefined, sellable: boolean): boolean {
  return sellable && spotsLeft === 0;
}
