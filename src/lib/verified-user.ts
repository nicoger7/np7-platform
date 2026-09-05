/**
 * Who holds this session, verified, without a network hop.
 *
 * Every authenticated request used to call auth.getUser(), which asks the
 * Supabase Auth server to validate the token. One network round trip, on every
 * admin request and every member page, before anything else could start. After
 * moving the functions to the same region as the database, that single call was
 * still ~300ms of a ~350ms middleware floor.
 *
 * getClaims() verifies the token's signature locally against the project's
 * published ES256 key (the JWKS is fetched once per process and cached), and
 * checks its expiry. Same cookies, same refresh path when a token has expired,
 * no round trip when it has not.
 *
 * The trade: a token that is still within its lifetime keeps working locally
 * even if the auth user were deleted server-side in the meantime, for at most
 * the token lifetime. That is not how staff are removed here. The middleware
 * checks team_members.active on every request, so deactivating a team member
 * takes effect immediately regardless.
 *
 * It FAILS BACK, not closed: anything local verification cannot answer falls
 * through to getUser(), so the worst case is the old speed, never a lockout.
 */

export type VerifiedUser = { id: string; email: string | null };

type AuthLike = {
  auth: {
    getClaims: () => Promise<{ data: { claims: Record<string, unknown> } | null; error: unknown }>;
    getUser: () => Promise<{ data: { user: { id: string; email?: string | null } | null } }>;
  };
};

export async function verifiedUser(client: AuthLike): Promise<VerifiedUser | null> {
  try {
    const { data, error } = await client.auth.getClaims();
    const sub = data?.claims?.sub;
    if (!error && typeof sub === "string" && sub) {
      const email = data!.claims.email;
      return { id: sub, email: typeof email === "string" ? email : null };
    }
  } catch {
    /* fall through to the server-side check */
  }
  const { data: { user } } = await client.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null } : null;
}
