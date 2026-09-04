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

/**
 * The same answer, but tolerant of a caller that hands us an origin.
 *
 * `origin` is threaded as a parameter through the account helpers, and until
 * now several callers filled it from `request.headers.get("origin")`. That is
 * not the address the request arrived at: it is a header the CLIENT sends, and
 * nothing between the browser and the handler validates it, because a genuine
 * cross-origin request is supposed to be able to say where it came from. A
 * magic link built on it is a live one-time token delivered to whatever domain
 * the caller typed, in our template, from our sending domain.
 *
 * Those callers now pass publicOrigin(). This exists so the next one cannot
 * reintroduce it by accident: anything that is not demonstrably ours is
 * replaced rather than trusted.
 *
 * vercel.app is deliberately NOT on the list. A preview URL is genuinely ours
 * and still wrong in an email, because it sits behind Vercel's SSO wall. That
 * is the incident in the note above.
 */
export function safeOrigin(candidate: string | null | undefined): string {
  if (!candidate) return publicOrigin();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return publicOrigin();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return publicOrigin();
  const host = url.hostname.toLowerCase();
  const ours = host === "np-seven.com" || host.endsWith(".np-seven.com");
  const dev = host === "localhost" || host === "127.0.0.1";
  if (!ours && !dev) return publicOrigin();
  return url.origin;
}
