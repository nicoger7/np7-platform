/**
 * Is a Supabase auth cookie present in this browser?
 *
 * A cheap, identity-free "could this be a member?" test, used to skip
 * member-only API calls that an anonymous visitor can only ever get an empty
 * body or a 401 from. Those calls are server function invocations, and on the
 * public pages the overwhelming majority of visitors are anonymous.
 *
 * NOT an auth check — never gate anything that matters on it. The server still
 * decides; this only avoids asking a question whose answer is already known.
 * (The same sniff has been feeding the analytics member/guest split since
 * launch, so the cookie is provably visible to document.cookie.)
 */
export function hasAuthCookie(): boolean {
  try {
    if (typeof document === "undefined") return false;
    return /sb-[^=]*-auth-token/.test(document.cookie);
  } catch {
    return false;
  }
}
