import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * A limit on how often a stranger may make us do something expensive.
 *
 * middleware.ts guards /admin, /api/admin and /account. Everything else is open
 * to the internet by design, which is correct for a public site right up to the
 * point where an open endpoint spends money. /api/portal/login takes an email
 * address from anyone and sends a real message through Resend, and because the
 * link is minted with auth.admin.generateLink (service role), Supabase's own
 * auth throttles never see it. That is a stranger with curl filling a member's
 * inbox and burning our sender reputation, which is the part that does not come
 * back.
 *
 * Deliberately narrow: this is called on the handful of endpoints that mail,
 * charge or invite. It is not middleware, and nothing on the public site's hot
 * path pays for it.
 *
 * It FAILS OPEN. If Postgres is unreachable, everyone gets through. Locking real
 * guests out of their own login because the counter's storage hiccuped is worse
 * than the flood it exists to stop, and a flood is survivable in a way that a
 * dead login on the morning of a trip is not.
 */

export type Limit = { limit: number; windowSeconds: number };

/** The limits, in one place, so a new endpoint picks a named policy instead of
 *  inventing numbers. Tuned for a business with tens of real logins a day. */
export const LIMITS = {
  /** Sends an email to an address the caller chose. The tight one. */
  mailToAnyAddress: { limit: 5, windowSeconds: 900 },
  /** Creates an account or a booking record. */
  signup: { limit: 12, windowSeconds: 3600 },
  /** Writes something cheap, or reads something we would rather not have scraped. */
  write: { limit: 60, windowSeconds: 3600 },
} satisfies Record<string, Limit>;

/**
 * Who is calling.
 *
 * Prefer the headers the platform sets over the one the client can send.
 * `x-forwarded-for` arrives as a chain and its first entry is whatever the
 * caller put there, so keying on it alone would let an attacker mint a fresh
 * bucket per request by changing one header. Vercel's own `x-vercel-forwarded-for`
 * and `x-real-ip` are written by the proxy and cannot be set from outside.
 */
export function clientKey(req: Request): string {
  const platform = req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip");
  if (platform) return platform.trim();
  const chain = req.headers.get("x-forwarded-for");
  // Last entry, not first: each hop appends, so the end of the chain is the one
  // written by the hop closest to us and hardest to forge.
  if (chain) {
    const parts = chain.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}

/** Addresses do not belong in a throwaway counter table, so the bucket carries a
 *  digest instead. Short is fine: this only has to not collide, not resist a
 *  determined search. */
async function digest(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toLowerCase()));
  return Buffer.from(new Uint8Array(buf)).toString("base64url").slice(0, 16);
}

async function hit(bucket: string, l: Limit): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data, error } = await db.rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_window_seconds: l.windowSeconds,
      p_limit: l.limit,
    });
    if (error) {
      // A missing function means the migration has not been applied yet. Say so
      // once in the log and let the request through; see the fail-open note.
      console.warn("rate limit unavailable:", error.message);
      return { allowed: true, retryAfter: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: true, retryAfter: 0 };
    return { allowed: row.allowed !== false, retryAfter: Number(row.retry_after) || 0 };
  } catch (e) {
    console.warn("rate limit failed open:", e instanceof Error ? e.message : e);
    return { allowed: true, retryAfter: 0 };
  }
}

/**
 * Guard an endpoint. Returns a 429 to return early, or null to carry on.
 *
 * Counts exactly ONE bucket per call, which is what lets the two guards
 * compose: an endpoint that mails an address calls this once at the top to
 * limit the caller, and again once it has parsed the address to limit the
 * mailbox. Counting the caller in both would have charged every request twice
 * and blocked real people at three tries instead of five.
 *
 * With `subject`, the bucket is the person being acted on rather than the
 * caller, so an attacker rotating IP addresses cannot buy a fresh allowance
 * against the same inbox. That bucket is deliberately looser: a guest who
 * really did press "send me a link" a few times should not be locked out.
 */
export async function rateLimited(
  req: Request,
  opts: { name: string; policy: Limit; subject?: string | null; message?: string },
): Promise<NextResponse | null> {
  const { bucket, policy } = opts.subject
    ? {
        bucket: `${opts.name}:to:${await digest(opts.subject)}`,
        policy: { limit: opts.policy.limit * 2, windowSeconds: opts.policy.windowSeconds * 4 },
      }
    : { bucket: `${opts.name}:ip:${clientKey(req)}`, policy: opts.policy };

  const { allowed, retryAfter } = await hit(bucket, policy);
  if (allowed) return null;

  return NextResponse.json(
    { error: opts.message ?? "Too many tries. Wait a moment and try again." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
  );
}
