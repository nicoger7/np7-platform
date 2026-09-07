/**
 * The wording a guest agrees to when they let NP7 use their likeness publicly.
 *
 * Lives here, not in the component, for two reasons. Consent only covers what it
 * described, so the text has to be stored alongside the timestamp — and the text
 * that gets stored must be the text that was SHOWN, which means the server picks
 * it rather than trusting whatever the browser sends. And when the wording is
 * revised, bump the version and add a new entry: existing rows keep the sentence
 * their owner actually read.
 */

export const MARKETING_CONSENT_VERSION = "2026-09-v1";

export const MARKETING_CONSENT_TEXT =
  "I allow NP7 to use photos and videos I appear in from this trip on np-seven.com, " +
  "on NP7's social media accounts and in paid advertising. I can withdraw this at any " +
  "time in my account. Withdrawing stops future use; material already printed or already " +
  "running in a campaign may take a while to disappear. This is optional and changes " +
  "nothing about my trip.";

/** What gets written to exp_bookings.marketing_consent_text. Versioned so an old
    row is still readable years later without guessing which wording applied. */
export function storedConsentText(): string {
  return `[${MARKETING_CONSENT_VERSION}] ${MARKETING_CONSENT_TEXT}`;
}
