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
