/**
 * The address a GUEST should see. Never the address the request arrived on.
 *
 * A cron is invoked at the deployment's own URL, and an admin action inherits
 * whatever host the admin's browser is on — localhost, a preview build, the
 * raw vercel.app domain. Any of those baked into a customer link is a link the
 * customer cannot open: that is exactly how 19 guests got 44 emails pointing at
 * an SSO wall on the morning the pipeline went live.
 *
 * One helper so there is one answer. Anything building a link that leaves the
 * building — email, PDF, share card — calls this.
 */
export function publicOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com").replace(/\/$/, "");
}
