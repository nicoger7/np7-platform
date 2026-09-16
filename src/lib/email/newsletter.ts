import { createHmac } from "node:crypto";

/**
 * The confirmation token for the newsletter double opt-in.
 *
 * Its own HMAC purpose ("newsletter-confirm"), NOT the unsubscribe secret with
 * the same input: if one token could serve both, an unsubscribe link out of any
 * old campaign would double as a consent link, and consent is the one thing
 * here that has to be un-forgeable.
 */
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.np-seven.com").replace(/\/$/, "");

function secret(): string {
  // Same fallback shape as the unsubscribe token: without a secret the links
  // still work within one deployment, they simply stop being portable.
  return process.env.EMAIL_LINK_SECRET || process.env.CRON_SECRET || "np7-newsletter";
}

export function newsletterToken(contactId: string): string {
  return createHmac("sha256", secret()).update(`newsletter-confirm:${contactId}`).digest("hex").slice(0, 32);
}

export function newsletterConfirmUrl(contactId: string): string {
  return `${APP_URL}/api/newsletter/confirm?c=${contactId}&t=${newsletterToken(contactId)}`;
}
