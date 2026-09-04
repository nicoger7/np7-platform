import type { NextRequest } from "next/server";

/**
 * One gate for every scheduled job, and it fails CLOSED.
 *
 * Six crons each carried their own copy of `if (!secret) return true`, meaning
 * "no secret configured, so let everyone in". The comment beside it said
 * "(dev)", but the same code ships to every deployment, and a Vercel preview
 * gets the production database key while CRON_SECRET is set only on production.
 * So an unlisted preview URL was an open door to jobs that email real guests,
 * expire real vouchers and delete real media. Two of the six were written after
 * that was first noticed and copied the pattern, which is what a per-file guard
 * gets you.
 *
 * Local development still works: set CRON_SECRET in .env.local, or call with
 * ?secret=. What is gone is the deployment that quietly needs no secret at all.
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret means nobody gets in, including us. A job that cannot run is a
  // missed send; a job anyone can run is a mailing to every guest.
  if (!secret) return false;
  // Vercel's scheduler sends exactly this header when CRON_SECRET is set on the
  // project, which it is on production. The query form stays for manual runs.
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("secret") === secret;
}

/** The 401 body every cron returns, so the reason is the same everywhere. */
export const CRON_DENIED = {
  error: "unauthorized",
  hint: "CRON_SECRET is not configured on this deployment, or the caller did not present it.",
} as const;
