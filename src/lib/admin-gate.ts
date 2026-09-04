/**
 * A second lock on every admin API route.
 *
 * The primary gate is middleware.ts: it resolves the session, checks the team
 * member is active, and checks their role reaches the section. Every route
 * under /api/admin used to rely on that alone — one lock in front of 263 doors,
 * and each door opens onto the service-role Supabase client, which bypasses RLS
 * entirely. Any hole in that single lock (a matcher that stops matching, a
 * framework bypass like GHSA-6gpp-xcg3-4w24) is not one leaked page, it is the
 * whole admin.
 *
 * So the middleware now also STAMPS each authorized request with a short-lived
 * signature, and every route checks it. Two properties matter:
 *
 *  - It is cheap. Verifying is one HMAC, no round trip. The middleware already
 *    paid for the session lookup; the route does not pay for it again.
 *  - It cannot lock anyone out. No stamp, bad stamp, expired stamp, missing
 *    key: the route falls back to the full database check (requireTeamMember).
 *    The stamp is a fast path, never the only path. Worst case for a bug here
 *    is a slower request, never a locked door.
 *
 * The key is SUPABASE_SERVICE_ROLE_KEY, which is server-only and already
 * present in every environment. HMAC does not reveal its key, and nothing here
 * ever sends the stamp to a browser: it lives on the internal forwarded
 * request. Client-supplied values are dropped in the middleware before any of
 * this runs, so a caller cannot mint their own.
 */

const HEADER = "x-np7-gate";
const TTL_MS = 60_000;

/** Every header the middleware mints. Stripped off inbound requests first. */
export const GATE_HEADERS = [HEADER, "x-np7-gate-method", "x-np7-gate-path"] as const;

function keyMaterial(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Buffer.from(new Uint8Array(sig)).toString("base64url");
}

/** Length-safe compare, so a wrong stamp cannot be found byte by byte. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Called by the middleware once a request has passed every admin check. */
export async function signGate(userId: string, method: string, path: string): Promise<string | null> {
  const secret = keyMaterial();
  if (!secret) return null;
  const exp = String(Date.now() + TTL_MS);
  const sig = await hmac(secret, `${exp}|${userId}|${method}|${path}`);
  return `${exp}.${userId}.${sig}`;
}

export async function verifyGate(stamp: string, method: string, path: string): Promise<boolean> {
  const secret = keyMaterial();
  if (!secret) return false;
  const firstDot = stamp.indexOf(".");
  const lastDot = stamp.lastIndexOf(".");
  if (firstDot <= 0 || lastDot <= firstDot) return false;
  const exp = stamp.slice(0, firstDot);
  const userId = stamp.slice(firstDot + 1, lastDot);
  const sig = stamp.slice(lastDot + 1);
  const expiresAt = Number(exp);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return sameString(sig, await hmac(secret, `${exp}|${userId}|${method}|${path}`));
}
