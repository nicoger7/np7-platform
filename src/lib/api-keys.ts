import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase";

/**
 * Partner API keys with editable scopes (migration 188).
 *
 * The point is that access stops being something a developer deploys and
 * becomes something Nico ticks in the admin: a partner gets a key, the key
 * carries scopes, and the scopes can be widened, narrowed or revoked without
 * touching code. A leaked key is one click, not a global rotation.
 *
 * Scopes name RESOURCES, never tables. `trips:read` is a promise about a
 * documented shape; `exp_editions:read` would be a promise about our column
 * names, and would break a partner the day we rename one. That distinction is
 * the whole reason this file has a registry instead of a wildcard.
 */

/** Every scope that exists, with the sentence the admin UI shows. Adding a
 *  capability starts HERE — an endpoint may only demand a scope listed here,
 *  so this object doubles as the public spec (see /api/partner/spec). */
export const SCOPES = {
  "trips:read": {
    label: "Trips & dates",
    detail: "Recent and upcoming weeks: name, start and end date, and whether it is a trip or a short event.",
  },
  "riders:read": {
    label: "Rider names",
    detail: "Who was on a given week — booking id and display name only. No email addresses, no contact details, no money.",
  },
  "guides:write": {
    label: "Deliver training guides",
    detail: "Push a rider's training guide into NP7. Creates a guide row; touches nothing else.",
  },
  "skills:write": {
    label: "Verify skills",
    detail: "Mark a rider's skill as verified via the partner's app. Never downgrades a coach's own verification.",
  },
} as const;

export type Scope = keyof typeof SCOPES;
export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];
export const isScope = (s: string): s is Scope => (ALL_SCOPES as string[]).includes(s);

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** A fresh key. Prefixed so a leaked string is recognisable in a log, and long
 *  enough that guessing is hopeless. Returned ONCE — only its hash is stored. */
export function generateKey(): { key: string; prefix: string; hash: string } {
  const key = `np7_${crypto.randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: sha256(key) };
}

export type KeyCheck =
  | { ok: true; keyId: string; name: string; scopes: string[] }
  | { ok: false; status: 401 | 403; error: string };

/** The Bearer token on a request, if any. */
function bearer(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() || null : null;
}

/**
 * Check a request's key and demand ONE scope.
 *
 * Deliberately distinguishes 401 (who are you?) from 403 (I know you, you may
 * not do this) — a partner debugging an integration needs to tell "wrong key"
 * from "missing permission", and guessing between them wastes exactly the
 * back-and-forth this whole system exists to remove.
 *
 * The env secret stays valid as a fallback so the existing wind.coach
 * integration keeps working the moment this ships; it is unscoped by nature,
 * so it is accepted only while no key with the needed scope has replaced it.
 */
export async function requireScope(req: Request, scope: Scope): Promise<KeyCheck> {
  const token = bearer(req);
  if (!token) return { ok: false, status: 401, error: "Missing Authorization: Bearer <key>." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: row } = await db
    .from("api_keys")
    .select("id,name,scopes,revoked_at,use_count")
    .eq("key_hash", sha256(token))
    .maybeSingle();

  if (row) {
    if (row.revoked_at) return { ok: false, status: 401, error: "This key has been revoked." };
    const scopes: string[] = Array.isArray(row.scopes) ? row.scopes : [];
    if (!scopes.includes(scope)) {
      return { ok: false, status: 403, error: `This key does not have the "${scope}" permission.` };
    }
    // Usage stamp — a key nobody uses is a key to revoke, and that is only
    // visible if we record it. Best-effort: never fail a call over telemetry.
    void db
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString(), last_used_scope: scope, use_count: (row.use_count ?? 0) + 1 })
      .eq("id", row.id)
      .then(() => {}, () => {});
    return { ok: true, keyId: String(row.id), name: String(row.name), scopes };
  }

  // Legacy: the single shared env secret, from before keys existed.
  const legacy = process.env.WINDCOACH_WEBHOOK_SECRET;
  if (legacy && crypto.timingSafeEqual(Buffer.from(sha256(token)), Buffer.from(sha256(legacy)))) {
    return { ok: true, keyId: "legacy-env", name: "wind.coach (shared secret)", scopes: ALL_SCOPES };
  }
  return { ok: false, status: 401, error: "Unknown key." };
}
