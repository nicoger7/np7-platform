import { NextResponse } from "next/server";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField, type EffectiveAccess, type WorldId } from "@/lib/access";

/**
 * Who may look at money, and whose money.
 *
 * Two separate questions, and the routes were only asking half of one.
 *
 * `effectiveCanSeeField(access, "money")` defaults its world argument to
 * "experience". Every finance and roadmap route called it that way, so a role
 * holding hardware.money and nothing else was refused everywhere, which is
 * exactly the NP7 Performance Team role. The three people it was created for
 * could not open the budget it was created for.
 *
 * The mirror of that bug is worse and was invisible while the first one masked
 * it: `world` and `entity` arrive in the query string and were never checked
 * against the caller's own worlds. Asking for ?world=experience was enough to
 * be handed Experience's entities. The two companies are legally separate, so
 * that is the one thing this file exists to prevent.
 *
 * A tier member (the legacy access_level path) still sees everything, which is
 * what "tier" has always meant elsewhere in the admin.
 */

export type MoneyAccess = { access: EffectiveAccess; world: WorldId };

const WORLDS: WorldId[] = ["experience", "hardware"];

/** Worlds this caller may enter at all. Tier members may enter any. */
export function permittedWorlds(access: EffectiveAccess): WorldId[] {
  if (access.kind === "tier") return WORLDS;
  return WORLDS.filter((w) => access.access.worlds.includes(w));
}

/** Worlds where this caller may additionally see figures. */
export function moneyWorlds(access: EffectiveAccess): WorldId[] {
  return permittedWorlds(access).filter((w) => effectiveCanSeeField(access, "money", w));
}

/**
 * Resolve the world a finance request is really operating in, and refuse if the
 * caller has no business there.
 *
 * `requested` is attacker-controlled, so it is validated rather than trusted:
 * it is honoured only when the caller may see money in it, and otherwise the
 * first world they legitimately have is used. A caller with none is refused.
 */
export async function requireMoneyAccess(
  requested?: string | null,
): Promise<MoneyAccess | NextResponse> {
  const access = await getRequestAccess();
  // No identity is not permission: getRequestAccess() returns null for an
  // unauthenticated or non-team caller.
  if (!access) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  const allowed = moneyWorlds(access);
  if (!allowed.length) {
    return NextResponse.json({ error: "You don't have access to financials." }, { status: 403 });
  }
  const asked = requested === "experience" || requested === "hardware" ? (requested as WorldId) : null;
  if (asked && !allowed.includes(asked)) {
    // Naming the other company's world is not a mistake to be silently
    // corrected into showing them their own; it is a refusal.
    return NextResponse.json(
      { error: "You don't have access to that company's financials." },
      { status: 403 },
    );
  }
  return { access, world: asked ?? allowed[0] };
}

/** True when the result of requireMoneyAccess is a refusal. */
export const isDenied = (r: MoneyAccess | NextResponse): r is NextResponse => r instanceof NextResponse;
