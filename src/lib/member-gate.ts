import { redirect } from "next/navigation";
import { headers } from "next/headers";

/**
 * Where a logged-out visitor goes when a world is member-visible but hidden.
 *
 * These worlds are NOT secret from members — a logged-in member sees them
 * today, before the public reveal. So a member who follows a link from an
 * email, or whose session has expired, was being told the page does not exist.
 * A 404 is the correct answer for something nobody may see; it is the wrong
 * answer for something THEY may see and simply are not signed in for.
 *
 * The login page says nothing about what is behind it, so this gives up very
 * little of the pre-launch quiet: a visitor learns the URL wants an account,
 * not what the account would show them. Worlds gated purely on a flag, with no
 * member exception at all (hardware, blog, spotguide), keep their plain 404 —
 * signing in would not help there, so offering it would be a lie.
 */
export async function redirectToMemberLogin(fallback: string): Promise<never> {
  // The middleware stamps the real path; the header carries the query too.
  const raw = (await headers()).get("x-np7-pathname") ?? "";
  const path = raw.split("?")[0] || fallback;
  // Only ever bounce to an in-app path — `next` is echoed into a link.
  const safe = /^\/(?!\/)/.test(path) ? path : fallback;
  redirect(`/account/login?next=${encodeURIComponent(safe)}`);
}
